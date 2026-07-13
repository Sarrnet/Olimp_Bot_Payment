import { i18n } from '../services/i18n.js'

interface TariffConfig {
    price: number
    oldPrice?: number
    price3: number
    oldPrice3?: number
    price6: number
    oldPrice6?: number
}

/**
 * Формирует текст с тарифными планами (1 / 3 / 6 месяцев).
 * Старая цена показывается зачёркнутой только если она задана и больше текущей.
 */
export function formatTariffs(config: Partial<TariffConfig> = {}, lang: string = 'ru'): string {
    const price = config.price ?? 1999
    const price3 = config.price3 ?? 2999
    const price6 = config.price6 ?? 3499

    const line = (title: string, current: number, old?: number): string => {
        const oldPart = old && old > current ? ` <s>${old}₽</s>` : ''
        return `${title} — <b>${current}₽</b>${oldPart}`
    }

    return (
        `${i18n.t(lang, 'messages.tariffs_title')}\n\n` +
        `💳 ${line(i18n.t(lang, 'messages.tariff_1m'), price, config.oldPrice)}\n` +
        `🔥 ${line(i18n.t(lang, 'messages.tariff_3m'), price3, config.oldPrice3)}   ${i18n.t(lang, 'messages.tariffs_popular')}\n` +
        `💎 ${line(i18n.t(lang, 'messages.tariff_6m'), price6, config.oldPrice6)}   ${i18n.t(lang, 'messages.tariffs_best_value')}\n\n` +
        `${i18n.t(lang, 'messages.tariffs_footer')}`
    )
}
