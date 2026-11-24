import { useMemo } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { activeChain } from '../config'
import { CREATOR_HUB_V2, V2_CONFIGURED } from '../contract'
import type { ContentV2 } from '../types'

/**
 * Loads V2 listings by id. getContent is called from the connected wallet so
 * the creator and verified buyers receive the (gated) content URL.
 */
export function useV2Contents(ids: bigint[], opts?: { refetchInterval?: number }) {
  const { address } = useAccount()

  const query = useReadContracts({
    contracts: ids.map((id) => ({
      ...CREATOR_HUB_V2,
      functionName: 'getContent' as const,
      args: [id] as [bigint],
      chainId: activeChain.id,
      account: address,
    })),
    query: {
      enabled: V2_CONFIGURED && ids.length > 0,
      refetchInterval: opts?.refetchInterval,
    },
  })

  const contents = useMemo(
    () =>
      (query.data ?? [])
        .map((d) => d.result as ContentV2 | undefined)
        .filter((c): c is ContentV2 => !!c),
    [query.data],
  )

  const hasError = (query.data ?? []).some((d) => d.status === 'failure')

  return { contents, isLoading: query.isLoading, isError: query.isError || hasError, refetch: query.refetch }
}
