
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_STEM_BOT_API_URL;
const API_TOKEN = process.env.STEM_BOT_API_BEARER_TOKEN;

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
export async function fetchSingleMemberName(discordUid: string): Promise<{data: {name_only: string} | null, error: any}> {
    if (!API_BASE_URL || !API_TOKEN) {
        console.error("Name API environment variables not set.");
        return { data: null, error: "API not configured." };
    }
    try {
        const response = await api.get(`/api/nickname?discord_uid=${discordUid}`);
        if (response.data.success) {
            return { data: response.data, error: null };
        }
        return { data: null, error: response.data.message || "Failed to fetch name."};
    } catch (error) {
        console.error(`Failed to fetch name for UID ${discordUid}:`, error);
        return { data: null, error };
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
export async function fetchAllMemberNames(): Promise<{ data: MemberName[] | null, error: any }> {
    if (!API_BASE_URL || !API_TOKEN) {
        console.error("Name API environment variables not set.");
        return { data: null, error: "API not configured." };
    }
    try {
        const response = await api.get('/api/members');
        if (response.data.success && Array.isArray(response.data.data)) {
            return { data: response.data.data, error: null };
        }
        return { data: null, error: response.data.message || "Failed to fetch members." };
    } catch (error) {
        console.error('Failed to fetch all member names:', error);
        return { data: null, error };
    }
}

    