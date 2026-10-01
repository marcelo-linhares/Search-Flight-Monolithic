export function money(cents: number): string {
  const reais = Math.round(cents) / 100
  const [int = '0', dec = '00'] = reais.toFixed(2).split('.')
  const withDots = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return dec === '00' && reais >= 1000 ? `R$${withDots}` : `R$${withDots},${dec}`
}

export function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y?.slice(2)}`
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(1, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}
