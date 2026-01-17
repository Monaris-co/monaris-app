// Reclaim Protocol integration for zkTLS proofs
import { ReclaimProofRequest } from '@reclaimprotocol/js-sdk'

export const reclaimAppId = import.meta.env.VITE_RECLAIM_APP_ID || ''
export const reclaimAppSecret = import.meta.env.VITE_RECLAIM_APP_SECRET || ''
export const reclaimProviderId = import.meta.env.VITE_RECLAIM_PROVIDER_ID || ''

export interface ReclaimProof {
  id: string
  title: string
  description: string
  benefit: string
  providerId: string
  type: 'wise-balance' | 'credit-karma' | 'bybit-profile' | 'wise-transaction' | 'boa-verification' | 'credit-score'
}

// Provider IDs from Reclaim dashboard
const PROVIDER_IDS = {
  'wise-balance': 'fbe865ee-ad0d-4e59-88bc-10352dcc0427', // Wise Balance
  'credit-karma': '3a57852f-6d25-4af3-b499-477fd9d7ebd7', // Credit Karma
  'bybit-profile': '19cc8a3c-b3b5-4deb-a106-58cc678d801d', // ByBit Profile Details
  'wise-transaction': 'cf88283c-5d4d-47de-a887-710fd797c5e3', // Wise - last tx info
  'boa-verification': '831f6210-015d-458a-b0aa-accf9b76694c', // Bank of America Account Balance
  'credit-score': 'cf6dd149-8444-49de-9851-63ed3a4f8832', // Experian - RW Credit Score
}

export const availableProofs: ReclaimProof[] = [
  {
    id: 'wise-balance',
    title: 'Wise Balance Verification',
    description: 'Verify your Wise account balance privately.',
    benefit: 'UNLOCKS TIER A FINANCING (95% LTV)',
    providerId: PROVIDER_IDS['wise-balance'],
    type: 'wise-balance',
  },
  {
    id: 'credit-karma',
    title: 'Credit Karma Verification',
    description: 'Verify your credit score via Credit Karma.',
    benefit: 'UNLOCKS PREMIUM FINANCING OPTIONS',
    providerId: PROVIDER_IDS['credit-karma'],
    type: 'credit-karma',
  },
  {
    id: 'bybit-profile',
    title: 'ByBit Profile Verification',
    description: 'Verify your ByBit profile details and trading activity.',
    benefit: 'ENHANCES CREDIBILITY SCORE',
    providerId: PROVIDER_IDS['bybit-profile'],
    type: 'bybit-profile',
  },
  {
    id: 'wise-transaction',
    title: 'Wise Transaction History',
    description: 'Prove your last transaction details from Wise.',
    benefit: 'REDUCES VERIFICATION TIME BY 24H',
    providerId: PROVIDER_IDS['wise-transaction'],
    type: 'wise-transaction',
  },
  {
    id: 'boa-verification',
    title: 'Bank of America Verification',
    description: 'Verify your BoA account status and balance.',
    benefit: 'INCREASES MAX INVOICE LIMIT',
    providerId: PROVIDER_IDS['boa-verification'],
    type: 'boa-verification',
  },
  {
    id: 'credit-score',
    title: 'Credit Score Verification',
    description: 'Verify your credit score via Experian.',
    benefit: 'LOWER INTEREST RATES BY 2%',
    providerId: PROVIDER_IDS['credit-score'],
    type: 'credit-score',
  },
]

export const initiateReclaimProof = async (proofType: ReclaimProof['type']): Promise<string> => {
  if (!reclaimAppId) {
    throw new Error('Coming Soon')
  }

  // Note: For production, you should use a backend endpoint to initialize Reclaim requests
  // to keep the APP_SECRET secure. For demo purposes, we allow client-side initialization.
  if (!reclaimAppSecret) {
    throw new Error(
      'Reclaim APP_SECRET is missing. ' +
      'For production, create a backend endpoint to initialize Reclaim requests. ' +
      'For demo/testing, you can set VITE_RECLAIM_APP_SECRET in your .env file (not recommended for production).'
    )
  }

  const proof = availableProofs.find((p) => p.type === proofType)
  if (!proof) {
    throw new Error(`Proof type ${proofType} not found`)
  }

  if (!proof.providerId) {
    throw new Error(`Provider ID not configured for proof type: ${proofType}`)
  }

  try {
    // Initialize Reclaim SDK using the static init() method
    // This requires APP_SECRET to generate signatures
    const reclaimRequest = await ReclaimProofRequest.init(
      reclaimAppId,
      reclaimAppSecret,
      proof.providerId,
      {
        log: false, // Set to true for debugging
      }
    )

    // Set callback URL for when verification completes
    reclaimRequest.setAppCallbackUrl(
      `${window.location.origin}/app/proofs?proof=${proofType}`,
      false // Set to true if you want JSON response format
    )

    // Set redirect URL (optional - where user goes after successful verification)
    reclaimRequest.setRedirectUrl(`${window.location.origin}/app/proofs?proof=${proofType}`)

    // Generate the request URL
    const url = await reclaimRequest.getRequestUrl()
    return url
  } catch (error) {
    console.error('Reclaim SDK error:', error)
    throw new Error(`Failed to create Reclaim proof request: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

