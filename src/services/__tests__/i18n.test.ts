import { describe, it, expect } from 'vitest'
import { i18n } from '../i18n.js'

describe('i18n', () => {
    it('returns a known key value', () => {
        expect(i18n.t('ru', 'messages.tariff_1m')).toBe('1 месяц')
    })

    it('substitutes params', () => {
        const out = i18n.t('ru', 'messages.status_active', { expiry: '01.01.2027' })
        expect(out).toContain('01.01.2027')
    })

    it('falls back to the key when missing', () => {
        expect(i18n.t('ru', 'messages.this_key_does_not_exist')).toBe(
            'messages.this_key_does_not_exist',
        )
    })

    it('treats any language as Russian (single-locale bot)', () => {
        expect(i18n.t('en', 'messages.tariff_3m')).toBe('3 месяца')
    })
})
