import { describe, it, expect } from 'vitest'
import { formatTariffs } from '../formatters.js'

describe('formatTariffs', () => {
    it('renders all three tariff prices', () => {
        const out = formatTariffs({ price: 1999, price3: 2999, price6: 3499 })
        expect(out).toContain('1999₽')
        expect(out).toContain('2999₽')
        expect(out).toContain('3499₽')
    })

    it('shows a struck-through old price only when it is higher than the current one', () => {
        const out = formatTariffs({
            price: 1999,
            oldPrice: 2999,
            price3: 2999,
            oldPrice3: 2999, // equal → not shown
            price6: 3499,
            oldPrice6: 0, // lower → not shown
        })
        expect(out).toContain('<s>2999₽</s>') // oldPrice for 1m is shown
        // oldPrice3 equals price3, so it must not be struck through as an old price
        expect(out).not.toContain('<s>2999₽</s> <s>')
    })

    it('falls back to defaults when nothing is passed', () => {
        const out = formatTariffs()
        expect(out).toContain('1999₽')
        expect(out).toContain('2999₽')
        expect(out).toContain('3499₽')
    })
})
