export function normalizeBangladeshPhone(value: string): string | null {
    let digits = value.replace(/\D/g, "");
    if (digits.startsWith("00880")) digits = digits.slice(2);
    // Store local and international input in one format for unique lookups.
    if (digits.startsWith("0")) digits = `880${digits.slice(1)}`;
    if (!/^8801[3-9]\d{8}$/.test(digits)) return null;
    return `+${digits}`;
}

export function phoneSearchDigits(value: string): string {
    const digits = value.replace(/\D/g, "");
    if (digits.startsWith("00880")) return digits.slice(2);
    if (digits.startsWith("0")) return `880${digits.slice(1)}`;
    return digits;
}
