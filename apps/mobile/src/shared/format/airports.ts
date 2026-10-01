export interface Airport { code: string; city: string; basePriceCents: number }

export const AIRPORTS: Airport[] = [
  { code: 'GRU', city: 'São Paulo', basePriceCents: 0 },
  { code: 'GIG', city: 'Rio de Janeiro', basePriceCents: 0 },
  { code: 'LHR', city: 'London', basePriceCents: 284000 },
  { code: 'LIS', city: 'Lisbon', basePriceCents: 231000 },
  { code: 'CDG', city: 'Paris', basePriceCents: 262000 },
  { code: 'MAD', city: 'Madrid', basePriceCents: 248000 },
  { code: 'JFK', city: 'New York', basePriceCents: 319000 },
  { code: 'EZE', city: 'Buenos Aires', basePriceCents: 98000 },
]

export const airportByCode = (code: string): Airport | undefined =>
  AIRPORTS.find((a) => a.code === code.trim().toUpperCase())
