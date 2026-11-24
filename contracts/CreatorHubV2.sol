// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title CreatorHubV2
 * @notice USDC content marketplace with immediate buyer access and pull-payment escrow.
 * @dev Escrow state machine: None -> Held on purchase; Held -> Disputed before the
 * five-day deadline; Held -> Released at or after that deadline. Disputed -> Released
 * or Refunded by an independent arbiter before the fourteen-day arbitration deadline;
 * Disputed -> Refunded permissionlessly at or after that deadline. Released and
 * Refunded are terminal. Refunded purchases lose access and cannot be repurchased.
 * Only listing and purchasing are paused; all settlement and withdrawal paths remain open.
 * Solvency invariant (for the configured, standard, non-fee-on-transfer USDC token):
 * usdc.balanceOf(address(this)) >= sum(pendingWithdrawals) + sum(amounts of Held or
 * Disputed escrows). Settlement only moves liabilities into pendingWithdrawals.
 * URLs and private storage are not confidential on-chain; access checks gate ABI reads,
 * not raw blockchain data. The immutable content hash commits to the listed content.
 */
contract CreatorHubV2 is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Time after purchase during which a buyer may dispute.
    uint256 public constant DISPUTE_WINDOW = 5 days;
    /// @notice Time after a dispute after which anyone may trigger a full buyer refund.
    uint256 public constant ARBITER_TIMEOUT = 14 days;
    /// @notice Maximum protocol fee, in basis points.
    uint256 public constant MAX_FEE_BPS = 1000;
    /// @notice Basis-point denominator used for fee calculations.
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Escrow lifecycle; Released and Refunded are terminal states.
    enum EscrowStatus { None, Held, Disputed, Released, Refunded }

    /// @notice Listing metadata, immutable commitment, and net marketplace statistics.
    struct Content {
        uint256 id; // One-based listing identifier.
        address creator; // Listing owner and escrow seller.
        string title; // Human-readable listing title.
        string description; // Human-readable description.
        string coverImageUrl; // Public cover image location.
        string contentUrl; // Content location, gated in the public view functions.
        bytes32 contentHash; // Required commitment; never changed after listing.
        uint256 priceUsdc; // Price in the configured token's smallest units.
        uint256 totalSales; // Purchases less refunded purchases, including unsettled escrows.
        uint256 totalEarnings; // Cumulative released seller proceeds, excluding fees.
        uint256 ratingSum; // Sum of currently valid stars.
        uint256 ratingCount; // Count of currently valid ratings.
        bool isActive; // Whether new purchases are enabled.
        uint256 createdAt; // Listing timestamp.
    }

    /// @notice One permanent purchase record per buyer/content pair.
    struct Escrow {
        uint256 id; // One-based escrow identifier.
        uint256 contentId; // Purchased listing identifier.
        address buyer; // Purchaser and potential refund recipient.
        address seller; // Creator snapshotted at purchase.
        uint256 amount; // Full purchase amount in token base units.
        uint256 feeBps; // Protocol fee snapshotted at purchase.
        uint256 paidAt; // Purchase timestamp, anchoring the dispute window.
        uint256 disputedAt; // Dispute timestamp, or zero before dispute.
        EscrowStatus status; // Current lifecycle state.
    }

    /// @dev Listing storage; use getContent for ABI reads.
    mapping(uint256 => Content) private contents;
    /// @dev Listing identifiers in creation order for each creator.
    mapping(address => uint256[]) private creatorContents;
    /// @notice Configured USDC token; immutable and never hardcoded.
    IERC20 public immutable usdc;
    /// @notice Recipient credited with protocol fees at release time.
    address public feeRecipient;
    /// @notice Current dispute arbiter; cannot decide its own purchases or sales.
    address public arbiter;
    /// @notice Fee in basis points snapshotted by subsequent purchases.
    uint256 public protocolFeeBps;
    /// @notice Number of listings; identifiers range from one through this value.
    uint256 public contentCount;
    /// @notice Number of escrows ever created, including terminal escrows.
    uint256 public escrowCount;
    /// @dev Permanent escrow records keyed by identifier.
    mapping(uint256 => Escrow) private escrows;
    /// @dev All escrow identifiers for each buyer, including refunds.
    mapping(address => uint256[]) private buyerEscrowIds;
    /// @dev All escrow identifiers for each seller, including terminal states.
    mapping(address => uint256[]) private creatorEscrowIds;
    /// @dev Unique buyer/content escrow identifier; zero means never purchased.
    mapping(address => mapping(uint256 => uint256)) private escrowIdOf;
    /// @notice Token amounts owed to recipients and available for withdrawal.
    mapping(address => uint256) public pendingWithdrawals;
    /// @dev Aggregate full purchase amounts currently Held for each seller.
    mapping(address => uint256) private creatorEscrowHeld;
    /// @dev Aggregate full purchase amounts currently Disputed for each seller.
    mapping(address => uint256) private creatorEscrowDisputed;
    /// @dev Current stars per listing/buyer; zero if absent or revoked.
    mapping(uint256 => mapping(address => uint8)) private ratingOf;
    /// @dev Permanent rating-use flag; remains true after a refund revokes stars.
    mapping(uint256 => mapping(address => bool)) private hasRated;
    /// @dev Review commitment only; review text is emitted, never stored here.
    mapping(uint256 => mapping(address => bytes32)) private reviewHashOf;

    /// @notice A required address was zero.
    error ZeroAddress();
    /// @notice The listing identifier does not exist.
    error ContentNotFound();
    /// @notice The escrow identifier does not exist.
    error EscrowNotFound();
    /// @notice Only the listing creator may perform this update.
    error NotContentCreator();
    /// @notice The listing is not accepting purchases.
    error ContentNotActive();
    /// @notice This buyer/content pair already has a permanent purchase record.
    error AlreadyPurchased();
    /// @notice A creator cannot buy their own listing.
    error CreatorCannotBuy();
    /// @notice The listing price must be positive.
    error InvalidPrice();
    /// @notice A new listing must have a nonempty title.
    error EmptyTitle();
    /// @notice A new listing requires a nonzero content commitment.
    error ZeroContentHash();
    /// @notice The listing price exceeds the buyer's limit.
    error PriceExceedsMax();
    /// @notice The requested protocol fee exceeds the maximum.
    error FeeTooHigh();
    /// @notice The caller cannot access this content URL.
    error Unauthorized();
    /// @notice Only the escrow buyer may open its dispute.
    error NotBuyer();
    /// @notice Only the current arbiter may resolve a dispute.
    error NotArbiter();
    /// @notice The arbiter cannot resolve an escrow involving itself.
    error ArbiterConflict();
    /// @notice The escrow is not in the state required for this operation.
    error InvalidEscrowState();
    /// @notice The buyer's dispute deadline has passed.
    error DisputeWindowClosed();
    /// @notice Permissionless release is not available before the dispute deadline.
    error DisputeWindowOpen();
    /// @notice The arbiter's resolution period has expired.
    error ArbiterTimeoutElapsed();
    /// @notice The permissionless refund deadline has not been reached.
    error TimeoutNotReached();
    /// @notice Only buyers with a non-refunded purchase can rate.
    error NotVerifiedBuyer();
    /// @notice Stars must be between one and five inclusive.
    error InvalidRating();
    /// @notice This buyer already used their one rating for this listing.
    error AlreadyRated();
    /// @notice The review exceeds the 1000-byte limit.
    error ReviewTooLong();

    /// @notice A creator published a listing and immutable content commitment.
    event ContentListed(uint256 indexed contentId, address indexed creator, uint256 priceUsdc, bytes32 contentHash);
    /// @notice A creator changed listing metadata, price, or its content URL.
    event ContentUpdated(uint256 indexed contentId);
    /// @notice A creator changed whether the listing accepts purchases.
    event ContentActiveChanged(uint256 indexed contentId, bool active);
    /// @notice A purchase created an escrow and immediately unlocked buyer access.
    event EscrowCreated(uint256 indexed escrowId, uint256 indexed contentId, address indexed buyer, address seller, uint256 amount, uint256 feeBps, uint256 disputeDeadline);
    /// @notice A buyer disputed a held escrow before its deadline.
    event DisputeOpened(uint256 indexed escrowId, uint256 indexed contentId, address indexed buyer);
    /// @notice An escrow became seller and protocol withdrawal credits.
    event EscrowReleased(uint256 indexed escrowId, uint256 indexed contentId, address indexed seller, uint256 sellerAmount, uint256 feeAmount);
    /// @notice The arbiter resolved a dispute with a full refund or full release.
    event DisputeResolved(uint256 indexed escrowId, bool refundedBuyer, address indexed arbiter);
    /// @notice An escrow became a full buyer withdrawal credit without a fee.
    event EscrowRefunded(uint256 indexed escrowId, address indexed buyer, uint256 amount);
    /// @notice A verified buyer rated content; review text exists only in this log.
    event ContentRated(uint256 indexed contentId, address indexed buyer, uint8 stars, bytes32 reviewHash, string reviewText);
    /// @notice A refunded buyer's rating was removed from aggregate statistics.
    event RatingRevoked(uint256 indexed contentId, address indexed buyer);
    /// @notice A recipient withdrew their accrued token credit.
    event Withdrawn(address indexed recipient, uint256 amount);
    /// @notice The fee for future purchases changed.
    event ProtocolFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    /// @notice The fee recipient for future releases changed.
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    /// @notice The current arbiter changed, including for existing disputes.
    event ArbiterUpdated(address indexed oldArbiter, address indexed newArbiter);

    /// @notice Configure USDC, owner, and arbiter; initialize the fee to 2.5%.
    /// @dev Validate the owner before Ownable so zero consistently reverts ZeroAddress.
    constructor(address usdcToken, address initialOwner, address initialArbiter)
        Ownable(_requireNonZero(initialOwner))
    {
        usdc = IERC20(_requireNonZero(usdcToken));
        arbiter = _requireNonZero(initialArbiter);
        feeRecipient = initialOwner;
        protocolFeeBps = 250;
    }

    /// @notice Publish active content with a positive token price and immutable hash.
    function listContent(
        string calldata title,
        string calldata description,
        string calldata coverImageUrl,
        string calldata contentUrl,
        bytes32 contentHash,
        uint256 priceUsdc
    ) external whenNotPaused {
        if (contentHash == bytes32(0)) revert ZeroContentHash();
        if (priceUsdc == 0) revert InvalidPrice();
        if (bytes(title).length == 0) revert EmptyTitle();
        uint256 id = ++contentCount;
        Content storage content = contents[id];
        content.id = id;
        content.creator = msg.sender;
        content.title = title;
        content.description = description;
        content.coverImageUrl = coverImageUrl;
        content.contentUrl = contentUrl;
        content.contentHash = contentHash;
        content.priceUsdc = priceUsdc;
        content.isActive = true;
        content.createdAt = block.timestamp;
        creatorContents[msg.sender].push(id);
        emit ContentListed(id, msg.sender, priceUsdc, contentHash);
    }

    /// @notice Update your listing's metadata and positive price, even while paused.
    /// @dev Does not change its content commitment, content URL, or existing escrows.
    function updateContent(
        uint256 contentId,
        string calldata title,
        string calldata description,
        string calldata coverImageUrl,
        uint256 priceUsdc
    ) external {
        Content storage content = _creatorContent(contentId);
        if (priceUsdc == 0) revert InvalidPrice();
        content.title = title;
        content.description = description;
        content.coverImageUrl = coverImageUrl;
        content.priceUsdc = priceUsdc;
        emit ContentUpdated(contentId);
    }

    /// @notice Update your content's location without changing its immutable hash.
    function updateContentUrl(uint256 contentId, string calldata newContentUrl) external {
        Content storage content = _creatorContent(contentId);
        content.contentUrl = newContentUrl;
        emit ContentUpdated(contentId);
    }

    /// @notice Enable or disable new purchases of your listing, even while paused.
    function setContentActive(uint256 contentId, bool active) external {
        Content storage content = _creatorContent(contentId);
        content.isActive = active;
        emit ContentActiveChanged(contentId, active);
    }

    /// @notice Buy once at no more than maxPriceUsdc and immediately gain URL access.
    /// @dev Records effects before the token interaction; a failed transfer reverts all
    /// effects atomically. Assumes standard USDC transfers deliver the exact amount.
    function purchaseContent(uint256 contentId, uint256 maxPriceUsdc)
        external nonReentrant whenNotPaused
    {
        Content storage content = _content(contentId);
        uint256 amount = content.priceUsdc;
        if (amount > maxPriceUsdc) revert PriceExceedsMax();
        if (!content.isActive) revert ContentNotActive();
        if (msg.sender == content.creator) revert CreatorCannotBuy();
        if (escrowIdOf[msg.sender][contentId] != 0) revert AlreadyPurchased();

        uint256 id = ++escrowCount;
        uint256 feeBps = protocolFeeBps;
        address seller = content.creator;
        escrows[id] = Escrow({
            id: id,
            contentId: contentId,
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            feeBps: feeBps,
            paidAt: block.timestamp,
            disputedAt: 0,
            status: EscrowStatus.Held
        });
        buyerEscrowIds[msg.sender].push(id);
        creatorEscrowIds[seller].push(id);
        escrowIdOf[msg.sender][contentId] = id;
        creatorEscrowHeld[seller] += amount;
        content.totalSales += 1;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit EscrowCreated(id, contentId, msg.sender, seller, amount, feeBps, block.timestamp + DISPUTE_WINDOW);
    }

    /// @notice Dispute your Held escrow strictly before its five-day deadline.
    function openDispute(uint256 escrowId) external {
        Escrow storage escrow = _escrow(escrowId);
        if (msg.sender != escrow.buyer) revert NotBuyer();
        if (escrow.status != EscrowStatus.Held) revert InvalidEscrowState();
        if (block.timestamp >= escrow.paidAt + DISPUTE_WINDOW) revert DisputeWindowClosed();
        escrow.status = EscrowStatus.Disputed;
        escrow.disputedAt = block.timestamp;
        creatorEscrowHeld[escrow.seller] -= escrow.amount;
        creatorEscrowDisputed[escrow.seller] += escrow.amount;
        emit DisputeOpened(escrowId, escrow.contentId, msg.sender);
    }

    /// @notice Anyone may release a Held escrow at or after its dispute deadline.
    function releaseEscrow(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = _escrow(escrowId);
        if (escrow.status != EscrowStatus.Held) revert InvalidEscrowState();
        if (block.timestamp < escrow.paidAt + DISPUTE_WINDOW) revert DisputeWindowOpen();
        _release(escrow);
    }

    /// @notice The independent current arbiter chooses full refund or full release.
    /// @dev Arbitration is allowed strictly before the dispute's timeout deadline.
    function resolveDispute(uint256 escrowId, bool refundBuyer) external nonReentrant {
        if (msg.sender != arbiter) revert NotArbiter();
        Escrow storage escrow = _escrow(escrowId);
        if (escrow.status != EscrowStatus.Disputed) revert InvalidEscrowState();
        if (block.timestamp >= escrow.disputedAt + ARBITER_TIMEOUT) revert ArbiterTimeoutElapsed();
        if (msg.sender == escrow.buyer || msg.sender == escrow.seller) revert ArbiterConflict();
        if (refundBuyer) _refund(escrow);
        else _release(escrow);
        emit DisputeResolved(escrowId, refundBuyer, msg.sender);
    }

    /// @notice Anyone may trigger a full buyer refund once arbitration times out.
    function claimTimeoutRefund(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = _escrow(escrowId);
        if (escrow.status != EscrowStatus.Disputed) revert InvalidEscrowState();
        if (block.timestamp < escrow.disputedAt + ARBITER_TIMEOUT) revert TimeoutNotReached();
        _refund(escrow);
    }

    /// @notice Whether a pair has any purchase whose status is neither None nor Refunded.
    function hasPurchased(address buyer, uint256 contentId) public view returns (bool) {
        uint256 id = escrowIdOf[buyer][contentId];
        if (id == 0) return false;
        EscrowStatus status = escrows[id].status;
        return status != EscrowStatus.None && status != EscrowStatus.Refunded;
    }

    /// @notice Read the URL as its creator or a currently entitled buyer.
    function getContentUrl(uint256 contentId) external view returns (string memory) {
        Content storage content = _content(contentId);
        if (msg.sender != content.creator && !hasPurchased(msg.sender, contentId)) revert Unauthorized();
        return content.contentUrl;
    }

    /// @notice Read metadata, blanking the URL for callers without content access.
    function getContent(uint256 contentId) external view returns (Content memory content) {
        content = _content(contentId);
        if (msg.sender != content.creator && !hasPurchased(msg.sender, contentId)) {
            content.contentUrl = "";
        }
    }

    /// @notice Rate a verified purchase once; review text is logged, not stored.
    function rateContent(uint256 contentId, uint8 stars, string calldata reviewText) external {
        if (!hasPurchased(msg.sender, contentId)) revert NotVerifiedBuyer();
        if (stars < 1 || stars > 5) revert InvalidRating();
        if (hasRated[contentId][msg.sender]) revert AlreadyRated();
        if (bytes(reviewText).length > 1000) revert ReviewTooLong();
        bytes32 reviewHash = bytes(reviewText).length == 0 ? bytes32(0) : keccak256(bytes(reviewText));
        ratingOf[contentId][msg.sender] = stars;
        hasRated[contentId][msg.sender] = true;
        reviewHashOf[contentId][msg.sender] = reviewHash;
        Content storage content = contents[contentId];
        content.ratingSum += stars;
        content.ratingCount += 1;
        emit ContentRated(contentId, msg.sender, stars, reviewHash, reviewText);
    }

    /// @notice Return the floor of average stars times 100 and the valid rating count.
    function getRating(uint256 contentId) external view returns (uint256 averageX100, uint256 count) {
        Content storage content = _content(contentId);
        count = content.ratingCount;
        averageX100 = count == 0 ? 0 : content.ratingSum * 100 / count;
    }

    /// @notice Return a buyer's current stars and historical review commitment.
    /// @dev Refund revocation zeroes stars but preserves the original review hash.
    function getUserRating(uint256 contentId, address user) external view returns (uint8 stars, bytes32 reviewHash) {
        return (ratingOf[contentId][user], reviewHashOf[contentId][user]);
    }

    /// @notice Read an existing escrow, reverting for invalid identifiers.
    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return _escrow(escrowId);
    }

    /// @notice Return a pair's permanent escrow identifier, or zero if none exists.
    function getEscrowIdFor(address buyer, uint256 contentId) external view returns (uint256) {
        return escrowIdOf[buyer][contentId];
    }

    /// @notice Return all of a buyer's escrow identifiers in purchase order.
    function getBuyerEscrowIds(address buyer) external view returns (uint256[] memory) {
        return buyerEscrowIds[buyer];
    }

    /// @notice Return all of a seller's escrow identifiers in purchase order.
    function getCreatorEscrowIds(address seller) external view returns (uint256[] memory) {
        return creatorEscrowIds[seller];
    }

    /// @notice Return full purchase amounts currently held and disputed for a seller.
    function getCreatorEscrowTotals(address seller) external view returns (uint256 held, uint256 disputed) {
        return (creatorEscrowHeld[seller], creatorEscrowDisputed[seller]);
    }

    /// @notice Return the creator's listing identifiers in creation order.
    function getCreatorContents(address creator) external view returns (uint256[] memory) {
        return creatorContents[creator];
    }

    /// @notice Sum released seller earnings and non-refunded sales over all creator listings.
    function getCreatorStats(address creator)
        external view returns (uint256 totalEarnings, uint256 totalSales, uint256 contentCountForCreator)
    {
        uint256[] storage ids = creatorContents[creator];
        contentCountForCreator = ids.length;
        for (uint256 i = 0; i < ids.length; ++i) {
            Content storage content = contents[ids[i]];
            totalEarnings += content.totalEarnings;
            totalSales += content.totalSales;
        }
    }

    /// @notice Return purchased content identifiers, including purchases later refunded.
    function getBuyerPurchases(address buyer) external view returns (uint256[] memory ids) {
        uint256[] storage escrowIds = buyerEscrowIds[buyer];
        ids = new uint256[](escrowIds.length);
        for (uint256 i = 0; i < escrowIds.length; ++i) {
            ids[i] = escrows[escrowIds[i]].contentId;
        }
    }

    /// @notice Return all currently active listing identifiers in ascending order.
    function getActiveContentIds() external view returns (uint256[] memory ids) {
        uint256 count;
        for (uint256 id = 1; id <= contentCount; ++id) {
            if (contents[id].isActive) ++count;
        }
        ids = new uint256[](count);
        uint256 index;
        for (uint256 id = 1; id <= contentCount; ++id) {
            if (contents[id].isActive) ids[index++] = id;
        }
    }

    /// @notice Return every listing identifier in ascending order.
    function getAllContentIds() external view returns (uint256[] memory ids) {
        ids = new uint256[](contentCount);
        for (uint256 i = 0; i < contentCount; ++i) ids[i] = i + 1;
    }

    /// @notice Return every currently disputed escrow identifier for the arbiter UI.
    /// @dev Scans all escrows; intended for off-chain view calls as history grows.
    function getDisputedEscrowIds() external view returns (uint256[] memory ids) {
        uint256 count;
        for (uint256 id = 1; id <= escrowCount; ++id) {
            if (escrows[id].status == EscrowStatus.Disputed) ++count;
        }
        ids = new uint256[](count);
        uint256 index;
        for (uint256 id = 1; id <= escrowCount; ++id) {
            if (escrows[id].status == EscrowStatus.Disputed) ids[index++] = id;
        }
    }

    /// @notice Replace the arbiter, including for disputes already open.
    function setArbiter(address newArbiter) external onlyOwner {
        _requireNonZero(newArbiter);
        address oldArbiter = arbiter;
        arbiter = newArbiter;
        emit ArbiterUpdated(oldArbiter, newArbiter);
    }

    /// @notice Change the fee for future purchases without changing escrow snapshots.
    function setProtocolFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        uint256 oldFeeBps = protocolFeeBps;
        protocolFeeBps = newFeeBps;
        emit ProtocolFeeUpdated(oldFeeBps, newFeeBps);
    }

    /// @notice Set the recipient credited on subsequent releases; old credits stay put.
    function setFeeRecipient(address newRecipient) external onlyOwner {
        _requireNonZero(newRecipient);
        address oldRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(oldRecipient, newRecipient);
    }

    /// @notice Pause new listings and purchases only.
    function pause() public onlyOwner {
        _pause();
    }

    /// @notice Resume new listings and purchases.
    function unpause() public onlyOwner {
        _unpause();
    }

    /// @notice Renounce ownership only while unpaused to avoid permanently locking intake.
    function renounceOwnership() public override onlyOwner whenNotPaused {
        super.renounceOwnership();
    }

    /// @notice Withdraw all of your accrued USDC; settlement never pushes tokens directly.
    /// @dev Clear credit before transferring, preserving checks-effects-interactions.
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        pendingWithdrawals[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @dev Convert an eligible Held or Disputed escrow into seller and fee credits.
    /// Callers enforce lifecycle and timing; no external transfers occur here.
    function _release(Escrow storage escrow) internal {
        EscrowStatus previousStatus = escrow.status;
        escrow.status = EscrowStatus.Released;
        if (previousStatus == EscrowStatus.Held) {
            creatorEscrowHeld[escrow.seller] -= escrow.amount;
        } else {
            creatorEscrowDisputed[escrow.seller] -= escrow.amount;
        }
        uint256 fee = escrow.amount * escrow.feeBps / BPS_DENOMINATOR;
        uint256 sellerShare = escrow.amount - fee;
        pendingWithdrawals[escrow.seller] += sellerShare;
        if (fee > 0) pendingWithdrawals[feeRecipient] += fee;
        contents[escrow.contentId].totalEarnings += sellerShare;
        emit EscrowReleased(escrow.id, escrow.contentId, escrow.seller, sellerShare, fee);
    }

    /// @dev Convert an eligible escrow into a full buyer credit and revoke any rating.
    /// Callers enforce lifecycle and timing; purchase identity and rating-use flags persist.
    function _refund(Escrow storage escrow) internal {
        EscrowStatus previousStatus = escrow.status;
        escrow.status = EscrowStatus.Refunded;
        if (previousStatus == EscrowStatus.Held) {
            creatorEscrowHeld[escrow.seller] -= escrow.amount;
        } else {
            creatorEscrowDisputed[escrow.seller] -= escrow.amount;
        }
        pendingWithdrawals[escrow.buyer] += escrow.amount;
        Content storage content = contents[escrow.contentId];
        content.totalSales -= 1;
        if (hasRated[escrow.contentId][escrow.buyer]) {
            content.ratingSum -= ratingOf[escrow.contentId][escrow.buyer];
            content.ratingCount -= 1;
            ratingOf[escrow.contentId][escrow.buyer] = 0;
            emit RatingRevoked(escrow.contentId, escrow.buyer);
        }
        emit EscrowRefunded(escrow.id, escrow.buyer, escrow.amount);
    }

    /// @dev Return an existing listing's storage reference or revert ContentNotFound.
    function _content(uint256 contentId) internal view returns (Content storage content) {
        if (contentId == 0 || contentId > contentCount) revert ContentNotFound();
        return contents[contentId];
    }

    /// @dev Return an existing listing only when the caller is its creator.
    function _creatorContent(uint256 contentId) internal view returns (Content storage content) {
        content = _content(contentId);
        if (content.creator != msg.sender) revert NotContentCreator();
    }

    /// @dev Return an existing escrow's storage reference or revert EscrowNotFound.
    function _escrow(uint256 escrowId) internal view returns (Escrow storage escrow) {
        if (escrowId == 0 || escrowId > escrowCount) revert EscrowNotFound();
        return escrows[escrowId];
    }

    /// @dev Validate and return an address, including before the Ownable constructor runs.
    function _requireNonZero(address account) private pure returns (address) {
        if (account == address(0)) revert ZeroAddress();
        return account;
    }
}
