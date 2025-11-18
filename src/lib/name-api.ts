
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_STEM_BOT_API_URL;
const API_TOKEN = process.env.STEM_BOT_API_BEARER_TOKEN;

if (!API_BASE_URL || !API_TOKEN) {
    console.error("Name API environment variables (NEXT_PUBLIC_STEM_BOT_API_URL, STEM_BOT_API_BEARER_TOKEN) are not set.");
}

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
    }
});

/**
 * Fetches the real name for a single Discord user.
 * @param discordUid The Discord user ID.
 * @returns The user's real name as a string, or null if not found or an error occurs.
 */
export async function fetchSingleMemberName(discordUid: string): Promise<string | null> {
    if (!API_BASE_URL || !API_TOKEN) return null;
    try {
        const response = await api.get(`/api/nickname?discord_uid=${discordUid}`);
        if (response.data.success && response.data.name_only) {
            return response.data.name_only;
        }
        return null;
    } catch (error) {
        console.error(`Failed to fetch name for UID ${discordUid}:`, error);
        return null;
    }
}

type MemberName = {
    uid: string;
    name: string;
};

/**
 * Fetches a list of all members and their real names from the Discord server.
 * @returns An array of objects with `uid` and `name`, or null if an error occurs.
 */
export async function fetchAllMemberNames(): Promise<MemberName[] | null> {
    if (!API_BASE_URL || !API_TOKEN) return null;
    try {
        const response = await api.get('/api/members');
        if (response.data.success && Array.isArray(response.data.data)) {
            return response.data.data;
        }
        return null;
    } catch (error) {
        console.error('Failed to fetch all member names:', error);
        return null;
    }
}
