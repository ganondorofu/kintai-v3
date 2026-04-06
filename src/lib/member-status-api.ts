
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_STEM_BOT_API_URL;
const API_TOKEN = process.env.STEM_BOT_API_BEARER_TOKEN;

if (!API_BASE_URL || !API_TOKEN) {
    console.warn("Member Status API environment variables are not fully set. Member Status API features will be disabled.");
}

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
    },
    timeout: 10000, // 10秒でタイムアウト
    validateStatus: (status) => status < 500, // 500番台エラーは例外としてスロー
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
        const url = `/api/member/status?discord_uid=${discordUid}`;

        const response = await api.get<MemberStatus>(url);

        // APIドキュメント通り、200で直接MemberStatusオブジェクトを返す
        // is_in_serverフィールドで所属状況を判定
        if (response.status === 200 && response.data.discord_uid) {
            return { data: response.data, error: null };
        }

        // 想定外のレスポンス
        return { data: null, error: "Unexpected response format"};
    } catch (error: any) {
        
        // エラーの種類を判別
        if (error.code === 'ECONNABORTED') {
            console.error('API request timeout for member status check');
            return { data: null, error: { message: 'API request timeout', code: 'TIMEOUT' } };
        } else if (error.response?.status >= 500) {
            console.error('API server error during member status check');
            return { data: null, error: { message: 'API server error', code: 'SERVER_ERROR', status: error.response.status } };
        } else if (error.response?.status === 400) {
            console.error('Bad request for member status check');
            return { data: null, error: { message: 'Invalid Discord UID', code: 'BAD_REQUEST' } };
        }

        console.error('Failed to fetch member status');
        return { data: null, error };
    }
}
