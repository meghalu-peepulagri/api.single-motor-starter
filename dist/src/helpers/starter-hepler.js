export function prepareStarterData(starterBoxPayload, userPayload) {
    return { ...starterBoxPayload, created_by: userPayload.id };
}
