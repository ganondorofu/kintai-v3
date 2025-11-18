
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_STEM_BOT_API_URL;
const API_TOKEN = process.env.STEM_BOT_API_BEARER_TOKEN;

if (!API_BASE_URL || !API_TOKEN) {
    console.warn("Member Status API environment variables (NEXT_PUBLIC_STEM_BOT_API_URL, STEM_BOT_API_BEARER_TOKEN) are not fully set. Member Status API features will be disabled.");
}

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
    }
});

type MemberStatus = {
    discord_uid: string;
    is_in_server: boolean;
    current_nickname: string | null;
    current_roles: string[];
};

/**
 * Fetches the status for a single Discord user from the server.
 * @param discordUid The Discord user ID.
 * @returns The user's status, or a default object if not found or an error occurs.
 */
export async function fetchMemberStatus(discordUid: string): Promise<{ data: MemberStatus | null, error: any }> {
    if (!API_BASE_URL || !API_TOKEN) {
        return { data: null, error: "API not configured." };
    }
    try {
        const response = await api.get(`/api/member/status?discord_uid=${discordUid}`);
        if (response.data.success) {
            return { data: response.data, error: null };
        }
        // This case might not be hit if API returns 404 for not found, but included for completeness.
        return { data: null, error: response.data.message || "Failed to fetch member status."};
    } catch (error: any) {
        if (error.response && error.response.status === 404) {
            // As per docs, 404 is a 'soft' error meaning user is not in server.
            const notInServerStatus: MemberStatus = {
                discord_uid: discordUid,
                is_in_server: false,
                current_nickname: null,
                current_roles: []
            };
            return { data: notInServerStatus, error: null };
        }
        console.error(`Failed to fetch member status for UID ${discordUid}:`, error);
        return { data: null, error };
    }
}

    