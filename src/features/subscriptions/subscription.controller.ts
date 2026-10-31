import type { Request, Response } from "express";
import { randomBytes } from "node:crypto";
import {
    addOneMonth,
    getMonthlyPrice,
    getOwnerBillingAccount,
    getTrialEnd,
    hasActiveSubscription,
    prisma,
    PRICE_PER_RICKSHAW,
    TRIAL_DAYS,
} from "./subscription.service.js";

type AuthRequest = Request & { auth?: { userId: string; role: string } };
type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
    typeof value === "object" && value !== null;

function gatewayConfig() {
    const isLive = process.env.SSLCOMMERZ_IS_LIVE === "true";
    const storeId = process.env.SSLCOMMERZ_STORE_ID ||
        (isLive ? "" : "testbox");
    const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD ||
        (isLive ? "" : "qwerty");

    if (!storeId || !storePassword) return null;

    return {
        isLive,
        storeId,
        storePassword,
        baseUrl: isLive
            ? "https://securepay.sslcommerz.com"
            : "https://sandbox.sslcommerz.com",
    };
}

function frontendRedirect(status: "paid" | "failed" | "cancelled") {
    const frontendUrl = new URL(process.env.FRONTEND_URL || "http://localhost:5173");
    frontendUrl.pathname = "/owner";
    frontendUrl.search = new URLSearchParams({ subscription: status }).toString();
    return frontendUrl.toString();
}

function redirectToFrontend(res: Response, status: "paid" | "failed" | "cancelled") {
    return res.redirect(303, frontendRedirect(status));
}

export async function getOwnerSubscription(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });

    try {
        const account = await getOwnerBillingAccount(auth.userId);
        if (!account) return res.status(404).json({ message: "Owner profile not found" });

        const now = new Date();
        const trialEndsAt = getTrialEnd(account.subscription.trialStartedAt);
        const isTrial = trialEndsAt > now &&
            (!account.subscription.paidUntil || account.subscription.paidUntil <= now);
        const isActive = hasActiveSubscription(account.subscription, now);
        const accessEndsAt = account.subscription.paidUntil &&
            account.subscription.paidUntil > trialEndsAt
            ? account.subscription.paidUntil
            : trialEndsAt;
        const daysRemaining = Math.max(
            0,
            Math.ceil((accessEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
        );
        const config = gatewayConfig();

        return res.json({
            active: isActive,
            isTrial,
            trialEndsAt: trialEndsAt.toISOString(),
            paidUntil: account.subscription.paidUntil?.toISOString() ?? null,
            accessEndsAt: accessEndsAt.toISOString(),
            daysRemaining,
            rickshawCount: account.rickshawCount,
            pricePerRickshaw: PRICE_PER_RICKSHAW,
            monthlyAmount: getMonthlyPrice(account.rickshawCount),
            isDemo: account.subscription.isDemo,
            checkoutAvailable: config !== null,
            currency: "BDT",
            paymentMode: config ? (config.isLive ? "LIVE" : "SANDBOX") : "UNAVAILABLE",
        });
    } catch (error) {
        console.error("Load owner subscription error:", error);
        return res.status(500).json({ message: "Could not load subscription details" });
    }
}

export async function startSubscriptionCheckout(req: Request, res: Response) {
    const auth = (req as AuthRequest).auth;
    if (!auth) return res.status(401).json({ message: "Authentication required" });

    const config = gatewayConfig();
    if (!config) {
        return res.status(503).json({
            message: "SSLCommerz credentials are required before checkout can start",
        });
    }

    try {
        const [account, owner] = await Promise.all([
            getOwnerBillingAccount(auth.userId),
            prisma.owner.findUnique({
                where: { userId: auth.userId },
                select: {
                    user: {
                        select: { name: true, email: true, phone: true },
                    },
                },
            }),
        ]);
        if (!account || !owner) {
            return res.status(404).json({ message: "Owner profile not found" });
        }
        if (account.rickshawCount < 1) {
            return res.status(409).json({
                message: "Register at least one rickshaw before choosing a monthly plan",
            });
        }

        const amount = getMonthlyPrice(account.rickshawCount);
        const transactionId = `RSH-${randomBytes(13).toString("hex")}`;
        if (amount > 500_000) {
            return res.status(400).json({
                message: "SSLCommerz supports fleet payments up to BDT 500,000 per checkout",
            });
        }
        const payment = await prisma.ownerSubscriptionPayment.create({
            data: {
                ownerId: account.ownerId,
                transactionId,
                amount: amount.toFixed(2),
                rickshawCount: account.rickshawCount,
            },
            select: { id: true },
        });

        const publicApiUrl = process.env.PUBLIC_API_URL || "http://localhost:5000";
        const callbackBase = `${publicApiUrl.replace(/\/$/, "")}/api/subscriptions/sslcommerz`;
        const checkoutFields = new URLSearchParams({
            store_id: config.storeId,
            store_passwd: config.storePassword,
            total_amount: amount.toFixed(2),
            currency: "BDT",
            tran_id: transactionId,
            success_url: `${callbackBase}/success`,
            fail_url: `${callbackBase}/fail`,
            cancel_url: `${callbackBase}/cancel`,
            ipn_url: `${callbackBase}/ipn`,
            cus_name: owner.user.name,
            cus_email: owner.user.email || "owner@example.com",
            cus_phone: owner.user.phone || "01700000000",
            cus_add1: "Bangladesh",
            cus_city: "Dhaka",
            cus_postcode: "1000",
            cus_country: "Bangladesh",
            shipping_method: "NO",
            product_name: `Rickshaw fleet plan (${account.rickshawCount} vehicles)`,
            product_category: "Fleet management software",
            product_profile: "non-physical-goods",
        });

        let response: globalThis.Response;
        try {
            response = await fetch(`${config.baseUrl}/gwprocess/v4/api.php`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: checkoutFields,
            });
        } catch (error) {
            await prisma.ownerSubscriptionPayment.update({
                where: { id: payment.id },
                data: { status: "FAILED" },
            });
            console.error("Connect to SSLCommerz checkout error:", error);
            return res.status(502).json({ message: "Could not connect to SSLCommerz" });
        }

        let gatewayResponse: unknown;
        try {
            gatewayResponse = await response.json();
        } catch (error) {
            await prisma.ownerSubscriptionPayment.update({
                where: { id: payment.id },
                data: { status: "FAILED" },
            });
            console.error("Read SSLCommerz checkout response error:", error);
            return res.status(502).json({ message: "SSLCommerz returned an invalid response" });
        }

        const gatewayPageUrl = isRecord(gatewayResponse)
            ? gatewayResponse.GatewayPageURL
            : undefined;
        const expectedHost = config.isLive
            ? "securepay.sslcommerz.com"
            : "sandbox.sslcommerz.com";
        let checkoutUrl: URL | null = null;
        if (typeof gatewayPageUrl === "string") {
            try {
                const candidate = new URL(gatewayPageUrl);
                if (candidate.protocol === "https:" && candidate.hostname === expectedHost) {
                    checkoutUrl = candidate;
                }
            } catch {
                checkoutUrl = null;
            }
        }

        if (!response.ok || !isRecord(gatewayResponse) ||
            gatewayResponse.status !== "SUCCESS" || !checkoutUrl) {
            await prisma.ownerSubscriptionPayment.update({
                where: { id: payment.id },
                data: { status: "FAILED" },
            });
            console.error("SSLCommerz checkout was rejected");
            return res.status(502).json({ message: "SSLCommerz could not start checkout" });
        }

        await prisma.ownerSubscriptionPayment.update({
            where: { id: payment.id },
            data: {
                gatewaySessionId: typeof gatewayResponse.sessionkey === "string"
                    ? gatewayResponse.sessionkey
                    : null,
            },
        });
        return res.json({ checkoutUrl: checkoutUrl.toString() });
    } catch (error) {
        console.error("Start owner subscription checkout error:", error);
        return res.status(500).json({ message: "Could not start subscription checkout" });
    }
}

async function confirmSubscriptionPayment(req: Request) {
    const transactionId = typeof req.body?.tran_id === "string" ? req.body.tran_id : "";
    const validationId = typeof req.body?.val_id === "string" ? req.body.val_id : "";
    if (!transactionId || !validationId) return false;

    const config = gatewayConfig();
    if (!config) return false;

    try {
        const payment = await prisma.ownerSubscriptionPayment.findUnique({
            where: { transactionId },
            select: { id: true, ownerId: true, amount: true, status: true },
        });
        if (!payment) return false;
        if (payment.status === "PAID") return true;

        const validationResponse = await fetch(
            `${config.baseUrl}/validator/api/validationserverAPI.php`,
            {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    val_id: validationId,
                    store_id: config.storeId,
                    store_passwd: config.storePassword,
                    format: "json",
                }),
            },
        );
        if (!validationResponse.ok) {
            console.error("SSLCommerz payment validation returned HTTP", validationResponse.status);
            return false;
        }
        const validation: unknown = await validationResponse.json();
        if (!isRecord(validation)) return false;

        const validatedTransaction = validation.tran_id;
        const validatedCurrency = validation.currency ?? validation.currency_type;
        const validatedAmount = Number(validation.amount);
        const expectedAmount = Number(payment.amount);
        if (
            !["VALID", "VALIDATED"].includes(String(validation.status)) ||
            validatedTransaction !== transactionId ||
            (typeof validation.val_id === "string" && validation.val_id !== validationId) ||
            validatedCurrency !== "BDT" ||
            !Number.isFinite(validatedAmount) ||
            Math.abs(validatedAmount - expectedAmount) >= 0.005
        ) {
            console.error("SSLCommerz payment validation did not match the pending payment");
            return false;
        }

        const paymentActivated = await prisma.$transaction(async (transaction) => {
            const updated = await transaction.ownerSubscriptionPayment.updateMany({
                where: { id: payment.id, status: "PENDING" },
                data: {
                    status: "PAID",
                    validationId,
                    paidAt: new Date(),
                },
            });
            if (updated.count === 0) {
                const currentPayment = await transaction.ownerSubscriptionPayment.findUnique({
                    where: { id: payment.id },
                    select: { status: true },
                });
                return currentPayment?.status === "PAID";
            }

            const subscription = await transaction.ownerSubscription.findUnique({
                where: { ownerId: payment.ownerId },
                select: { trialStartedAt: true, paidUntil: true },
            });
            if (!subscription) {
                throw new Error("Owner subscription record was missing during payment activation");
            }
            const trialEndsAt = getTrialEnd(subscription.trialStartedAt);
            const startDate = [new Date(), subscription.paidUntil, trialEndsAt]
                .filter((date): date is Date => date !== null)
                .reduce((latest, date) => date > latest ? date : latest);
            await transaction.ownerSubscription.update({
                where: { ownerId: payment.ownerId },
                data: { paidUntil: addOneMonth(startDate) },
            });
            return true;
        });

        return paymentActivated;
    } catch (error) {
        console.error("Confirm owner subscription payment error:", error);
        return false;
    }
}

export async function handleSubscriptionPaymentSuccess(req: Request, res: Response) {
    const paid = await confirmSubscriptionPayment(req);
    return redirectToFrontend(res, paid ? "paid" : "failed");
}

export async function handleSubscriptionPaymentIpn(req: Request, res: Response) {
    const paid = await confirmSubscriptionPayment(req);
    return res.status(paid ? 200 : 400).json({
        message: paid ? "Subscription payment confirmed" : "Subscription payment could not be confirmed",
    });
}

export async function handleSubscriptionPaymentFailure(req: Request, res: Response) {
    const transactionId = typeof req.body?.tran_id === "string" ? req.body.tran_id : "";
    if (transactionId) {
        try {
            await prisma.ownerSubscriptionPayment.updateMany({
                where: { transactionId, status: "PENDING" },
                data: { status: "FAILED" },
            });
        } catch (error) {
            console.error("Record failed subscription payment error:", error);
            return res.status(500).json({ message: "Could not record payment status" });
        }
    }
    return redirectToFrontend(res, "failed");
}

export async function handleSubscriptionPaymentCancellation(req: Request, res: Response) {
    const transactionId = typeof req.body?.tran_id === "string" ? req.body.tran_id : "";
    if (transactionId) {
        try {
            await prisma.ownerSubscriptionPayment.updateMany({
                where: { transactionId, status: "PENDING" },
                data: { status: "FAILED" },
            });
        } catch (error) {
            console.error("Record cancelled subscription payment error:", error);
            return res.status(500).json({ message: "Could not record payment status" });
        }
    }
    return redirectToFrontend(res, "cancelled");
}
