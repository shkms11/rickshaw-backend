import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type EncryptedNid = {
    nid: string | null;
    nidIv: string | null;
    nidAuthTag: string | null;
};

function getEncryptionKey() {
    const key = process.env.NID_ENCRYPTION_KEY;
    if (!key || !/^[0-9a-f]{64}$/i.test(key)) {
        throw new Error("NID_ENCRYPTION_KEY must be configured as 32-byte hexadecimal");
    }
    return Buffer.from(key, "hex");
}

export function encryptNid(value: string): EncryptedNid {
    if (!value) return { nid: null, nidIv: null, nidAuthTag: null };
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
    const encrypted = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
    ]);
    return {
        nid: encrypted.toString("hex"),
        nidIv: iv.toString("hex"),
        nidAuthTag: cipher.getAuthTag().toString("hex"),
    };
}

export function decryptNid(value: EncryptedNid) {
    if (!value.nid) return null;
    if (!value.nidIv || !value.nidAuthTag) {
        throw new Error("Stored NID is missing encryption metadata");
    }
    const decipher = createDecipheriv(
        "aes-256-gcm",
        getEncryptionKey(),
        Buffer.from(value.nidIv, "hex"),
    );
    decipher.setAuthTag(Buffer.from(value.nidAuthTag, "hex"));
    return Buffer.concat([
        decipher.update(Buffer.from(value.nid, "hex")),
        decipher.final(),
    ]).toString("utf8");
}
