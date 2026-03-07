export async function fetchOverview() {
    try {
        const response = await fetch("/api/analytics/overview");
        if (!response.ok) {
            // If endpoint doesn't exist, return null to indicate fallback needed
            if (response.status === 404) {
                console.warn("Analytics overview endpoint not found, using Supabase data only");
                return null;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.warn("Failed to fetch analytics overview, falling back to Supabase:", error);
        return null;
    }
}
