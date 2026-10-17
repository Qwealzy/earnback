/** Parse a raw wagmi/viem error into a user-friendly one-liner. */
export function parseOnchainError(error: unknown): string {
  if (!error) return 'Unknown error'
  const msg: string = (error as { message?: string }).message?.toLowerCase() ?? ''

  if (msg.includes('user rejected') || (error as { code?: number }).code === 4001) {
    return 'Transaction cancelled.'
  }
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) {
    return 'Insufficient balance.'
  }
  if (msg.includes('wrongstate')) return 'Agreement is not in the required state.'
  if (msg.includes('notpayer')) return 'Only the payer can do this.'
  if (msg.includes('notpayee')) return 'Only the payee can do this.'
  if (msg.includes('notarbiter')) return 'Only the arbiter can do this.'
  if (msg.includes('notparty')) return 'Only a party to this agreement can do this.'
  if (msg.includes('deadlinepassed')) return 'The deadline has already passed.'
  if (msg.includes('deadlinenotpassed')) return 'The deadline has not yet passed.'
  if (msg.includes('zeroamount')) return 'Amount must be greater than zero.'
  if (msg.includes('exceedspool')) return 'Amount exceeds the retained pool.'
  if (msg.includes('exceedsmaxheld')) return 'Would exceed vault maximum held limit.'
  if (msg.includes('exceeds contract value')) return 'Amount exceeds the contract value.'
  if (msg.includes('invalidbps')) return 'Invalid basis-point value.'
  if (msg.includes('alreadysigned')) return 'Already signed.'
  if (msg.includes('reentrant')) return 'Reentrancy guard triggered.'
  if (msg.includes('reverted')) {
    const m = msg.match(/reason="([^"]+)"/)
    return m ? `Transaction failed: ${m[1]}` : 'Transaction failed.'
  }
  if (msg.includes('network') || msg.includes('timeout')) {
    return 'Network error. Check connection and retry.'
  }
  return 'Something went wrong. Please try again.'
}
