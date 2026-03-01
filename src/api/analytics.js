export async function fetchOverview() {
    try {
        const response = await fetch("/api/analytics/overview");
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Failed to fetch analytics overview:", error);
        throw error;
    }
}
