import { parse, isValid } from "date-fns";
function parseTimestamp(ct) {
    if (ct) {
        const parsed = parse(ct, "yy/MM/dd,HH:mm:ss", new Date());
        if (isValid(parsed)) {
            return parsed.toISOString();
        }
    }
    return new Date().toISOString();
}
// Usage
export { parseTimestamp };
