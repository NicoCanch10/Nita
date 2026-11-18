"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.changePasswordFn = exports.signInWithPasswordCustomTokenFn = exports.registerPasswordAccountFn = exports.DEFAULT_DATABASE_ID = exports.NITA_HASH_PEPPER = void 0;
exports.extractClientIp = extractClientIp;
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const logger = __importStar(require("firebase-functions/logger"));
const params_1 = require("firebase-functions/params");
const v2_1 = require("firebase-functions/v2");
const https_1 = require("firebase-functions/v2/https");
const accountService_1 = require("./accountService");
exports.NITA_HASH_PEPPER = (0, params_1.defineSecret)('NITA_HASH_PEPPER');
exports.DEFAULT_DATABASE_ID = 'ai-studio-distribuidordedi-aff91045-91e1-4730-8049-ab5f53276b3f';
(0, v2_1.setGlobalOptions)({
    region: 'us-central1',
    maxInstances: 10,
    memory: '512MiB',
    concurrency: 4,
    timeoutSeconds: 30,
});
function getFirebaseAdminServices() {
    const app = (0, app_1.getApps)().length === 0 ? (0, app_1.initializeApp)() : (0, app_1.getApps)()[0];
    const databaseId = process.env.NITA_FIRESTORE_DATABASE_ID || exports.DEFAULT_DATABASE_ID;
    const db = (0, firestore_1.getFirestore)(app, databaseId);
    const auth = (0, auth_1.getAuth)(app);
    return { db, auth };
}
function resolvePepper() {
    let pepper = '';
    try {
        pepper = exports.NITA_HASH_PEPPER.value();
    }
    catch {
        pepper = process.env.NITA_HASH_PEPPER || '';
    }
    if (!pepper) {
        pepper = process.env.NITA_HASH_PEPPER || '';
    }
    if (!pepper || pepper.length < 16) {
        throw new https_1.HttpsError('failed-precondition', 'Configuración de seguridad del servidor incompleta.');
    }
    return pepper;
}
function normalizeIpString(raw) {
    if (typeof raw !== 'string')
        return null;
    let cleaned = raw.trim();
    if (!cleaned)
        return null;
    if (cleaned.startsWith('::ffff:')) {
        cleaned = cleaned.slice(7);
    }
    return cleaned.slice(0, 128) || null;
}
/**
 * Extrae la IP de origen priorizando la IP confiable resuelta por la plataforma
 * (Firebase / Cloud Run / Express `rawRequest.ip`), ignorando `x-forwarded-for`
 * manipulable por el cliente y usando `socket.remoteAddress` únicamente como respaldo.
 */
function extractClientIp(request) {
    const rawReq = request.rawRequest;
    const platformIp = normalizeIpString(rawReq?.ip);
    if (platformIp) {
        return platformIp;
    }
    const socketIp = normalizeIpString(rawReq?.socket?.remoteAddress);
    if (socketIp) {
        return socketIp;
    }
    return 'unknown';
}
function toHttpsError(err) {
    if (err instanceof https_1.HttpsError) {
        return err;
    }
    if (err instanceof accountService_1.AccountServiceError) {
        return new https_1.HttpsError(err.code, err.message);
    }
    logger.error('[NITA Auth Backend] Unexpected non-secret operational error', {
        name: err instanceof Error ? err.name : 'UnknownError',
        message: err instanceof Error ? err.message : 'Operational error',
    });
    return new https_1.HttpsError('internal', 'No se pudo completar la operación de autenticación.');
}
exports.registerPasswordAccountFn = (0, https_1.onCall)({
    secrets: [exports.NITA_HASH_PEPPER],
    memory: '512MiB',
    concurrency: 4,
    cors: true,
}, async (request) => {
    try {
        const { db, auth } = getFirebaseAdminServices();
        const pepper = resolvePepper();
        const data = (request.data && typeof request.data === 'object' ? request.data : {});
        return await (0, accountService_1.registerPasswordAccount)({
            db,
            auth,
            pepper,
            ipAddress: extractClientIp(request),
        }, {
            username: data.username,
            password: data.password,
        });
    }
    catch (err) {
        throw toHttpsError(err);
    }
});
exports.signInWithPasswordCustomTokenFn = (0, https_1.onCall)({
    secrets: [exports.NITA_HASH_PEPPER],
    memory: '512MiB',
    concurrency: 4,
    cors: true,
}, async (request) => {
    try {
        const { db, auth } = getFirebaseAdminServices();
        const pepper = resolvePepper();
        const data = (request.data && typeof request.data === 'object' ? request.data : {});
        return await (0, accountService_1.signInWithPasswordCustomToken)({
            db,
            auth,
            pepper,
            ipAddress: extractClientIp(request),
        }, {
            username: data.username,
            password: data.password,
        });
    }
    catch (err) {
        throw toHttpsError(err);
    }
});
exports.changePasswordFn = (0, https_1.onCall)({
    secrets: [exports.NITA_HASH_PEPPER],
    memory: '512MiB',
    concurrency: 4,
    cors: true,
}, async (request) => {
    try {
        if (!request.auth?.uid) {
            throw new https_1.HttpsError('unauthenticated', 'Debes iniciar sesión para cambiar tu contraseña.');
        }
        const { db, auth } = getFirebaseAdminServices();
        const pepper = resolvePepper();
        const data = (request.data && typeof request.data === 'object' ? request.data : {});
        const tokenClaims = request.auth.token && typeof request.auth.token === 'object'
            ? request.auth.token
            : {};
        const tokenProvider = Object.prototype.hasOwnProperty.call(tokenClaims, 'provider')
            ? tokenClaims.provider
            : undefined;
        const tokenSessionEpoch = Object.prototype.hasOwnProperty.call(tokenClaims, 'sessionEpoch')
            ? tokenClaims.sessionEpoch
            : undefined;
        return await (0, accountService_1.changePassword)({
            db,
            auth,
            pepper,
            ipAddress: extractClientIp(request),
        }, {
            callerUid: request.auth.uid,
            tokenProvider,
            tokenSessionEpoch,
            currentPassword: data.currentPassword,
            newPassword: data.newPassword,
        });
    }
    catch (err) {
        throw toHttpsError(err);
    }
});
//# sourceMappingURL=index.js.map