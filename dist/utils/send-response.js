export function sendResponse(c, status, message, data) {
    const respData = {
        status,
        success: true,
        message,
        data: data ?? null,
    };
    return c.json(respData, status);
}
