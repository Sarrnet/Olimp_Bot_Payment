import { prisma } from '../db/prisma.js'
import { logger } from '../utils/logger.js'

// Default prices for a freshly-created A/B group. Mirrors the AbConfig schema
// defaults so a group created in code matches one created by a raw migration.
const DEFAULTS = {
    price: 1999,
    oldPrice: 2999,
    priceCrypto: 26,
    price3: 2999,
    oldPrice3: 4499,
    price3Crypto: 39,
    price6: 3499,
    oldPrice6: 5999,
    price6Crypto: 45,
    priceStars: 2000,
    price3Stars: 3000,
    price6Stars: 3500,
}

export class AbService {
    /**
     * Gets all available AB groups for admin panel
     */
    async getGroups() {
        return prisma.abConfig.findMany({ orderBy: { name: 'asc' } })
    }

    /**
     * Gets full config for a specific group.
     */
    async getGroupConfig(groupName: string) {
        try {
            return await prisma.abConfig.findUnique({ where: { name: groupName } })
        } catch (error) {
            logger.error(`Error fetching config for group ${groupName}:`, error)
            return null
        }
    }

    /**
     * Gets price for a specific group (1 month). Fallback to default if not found.
     */
    async getPrice(groupName: string): Promise<number> {
        try {
            const config = await prisma.abConfig.findUnique({ where: { name: groupName } })
            return config?.price || DEFAULTS.price
        } catch (error) {
            logger.error(`Error fetching price for group ${groupName}:`, error)
            return DEFAULTS.price
        }
    }

    /**
     * Distributes a new user to an active group.
     */
    async getRandomActiveGroup(): Promise<string> {
        try {
            const activeGroups = await prisma.abConfig.findMany({ where: { isActive: true } })

            if (activeGroups.length === 0) {
                // Try default group
                const defaultGroup = await prisma.abConfig.findFirst({ where: { isDefault: true } })
                if (defaultGroup) return defaultGroup.name

                // Final fallback
                return 'A'
            }

            const randomIndex = Math.floor(Math.random() * activeGroups.length)
            return activeGroups[randomIndex].name
        } catch (error) {
            logger.error('Error distributing user to AB group:', error)
            return 'A'
        }
    }

    /**
     * Updates group configuration
     */
    async updateGroup(
        name: string,
        data: {
            price?: number
            oldPrice?: number
            priceCrypto?: number
            price3?: number
            oldPrice3?: number
            price3Crypto?: number
            price6?: number
            oldPrice6?: number
            price6Crypto?: number
            priceStars?: number
            price3Stars?: number
            price6Stars?: number
            isActive?: boolean
            isDefault?: boolean
        },
    ) {
        // If setting as default, unset others
        if (data.isDefault) {
            await prisma.abConfig.updateMany({
                where: { isDefault: true },
                data: { isDefault: false },
            })
        }

        return prisma.abConfig.upsert({
            where: { name },
            update: data,
            create: {
                name,
                price: data.price ?? DEFAULTS.price,
                oldPrice: data.oldPrice ?? DEFAULTS.oldPrice,
                priceCrypto: data.priceCrypto ?? DEFAULTS.priceCrypto,
                price3: data.price3 ?? DEFAULTS.price3,
                oldPrice3: data.oldPrice3 ?? DEFAULTS.oldPrice3,
                price3Crypto: data.price3Crypto ?? DEFAULTS.price3Crypto,
                price6: data.price6 ?? DEFAULTS.price6,
                oldPrice6: data.oldPrice6 ?? DEFAULTS.oldPrice6,
                price6Crypto: data.price6Crypto ?? DEFAULTS.price6Crypto,
                priceStars: data.priceStars ?? DEFAULTS.priceStars,
                price3Stars: data.price3Stars ?? DEFAULTS.price3Stars,
                price6Stars: data.price6Stars ?? DEFAULTS.price6Stars,
                isActive: data.isActive ?? true,
                isDefault: data.isDefault ?? false,
            },
        })
    }

    /**
     * Deletes a group (with safety check)
     */
    async deleteGroup(name: string) {
        if (name === 'A') throw new Error('Cannot delete protected group A')
        return prisma.abConfig.delete({ where: { name } })
    }
}

export const abService = new AbService()
