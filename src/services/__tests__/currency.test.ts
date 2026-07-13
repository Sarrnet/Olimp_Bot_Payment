import { describe, it, expect, vi, beforeEach } from 'vitest'
import { currencyService } from '../currency.js'

describe('CurrencyService', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Reset internal state of the singleton for tests
        ;(currencyService as any).rates = {}
        ;(currencyService as any).lastFetch = 0

        // Mock global fetch
        global.fetch = vi.fn()
    })

    it('should return the same amount for RUB without an API call', async () => {
        const result = await currencyService.convertFromRUB(1999, 'RUB')
        expect(result).toBe(1999)
        expect(global.fetch).not.toHaveBeenCalled()
    })

    it('should convert RUB to USD with a 2% buffer using API data', async () => {
        ;(global.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => ({ rub: { usd: 0.011 } }),
        })

        const result = await currencyService.convertFromRUB(1000, 'USD')
        // 1000 * 0.011 * 1.02 = 11.22
        expect(result).toBeCloseTo(11.22, 2)
    })

    it('should fall back to hardcoded rates when the API fails', async () => {
        ;(global.fetch as any).mockRejectedValue(new Error('network down'))

        const result = await currencyService.convertFromRUB(100, 'BYN')
        // fallback byn = 0.035 => 100 * 0.035 * 1.02 = 3.57
        expect(result).toBeCloseTo(3.57, 2)
    })
})
