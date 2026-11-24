/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'mainnet' (default) or 'testnet' */
  readonly VITE_NETWORK?: string
  readonly VITE_CREATOR_HUB_V2_ADDRESS?: string
  readonly VITE_CREATOR_HUB_V1_ADDRESS?: string
  readonly VITE_RPC_URL?: string
  readonly VITE_APP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
