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
exports.AccountServiceError = void 0;
exports.validateUsernameFormat = validateUsernameFormat;
exports.validatePasswordInput = validatePasswordInput;
exports.deriveSanitizedBaseUid = deriveSanitizedBaseUid;
exports.deriveDisambiguatedUid = deriveDisambiguatedUid;
exports.registerPasswordAccount = registerPasswordAccount;
exports.signInWithPasswordCustomToken = signInWithPasswordCustomToken;
exports.changePassword = changePassword;
const crypto = __importStar(require("node:crypto"));
const firestore_1 = require("firebase-admin/firestore");
const crypto_1 = require("./crypto");
const rateLimit_1 = require("./rateLimit");
class AccountServiceError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'AccountServiceError';
        this.code = code;
    }
}
exports.AccountServiceError = AccountServiceError;
function validateUsernameFormat(username) {
    if (typeof username !== 'string') {
        return { valid: false, error: 'Por favor, ingresa un nombre de usuario.' };
    }
    const trimmed = username.trim();
    if (!trimmed) {
        return { valid: false, error: 'Por favor, ingresa un nombre de usuario.' };
    }
    if (trimmed.length < 3) {
        return { valid: false, error: 'El nombre de usuario debe tener al menos 3 caracteres.' };
    }
    if (trimmed.length > 25) {
        return { valid: false, error: 'El nombre de usuario no puede tener más de 25 caracteres.' };
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
        return {
            valid: false,
            error: 'El nombre de usuario solo puede contener letras, números, guiones y puntos.',
        };
    }
    return { valid: true, cleanUsername: trimmed };
}
function validatePasswordInput(password) {
    if (typeof password !== 'string' || !password) {
        return { valid: false, error: 'Por favor, ingresa una contraseña.' };
    }
    if (password.length < 6) {
        return { valid: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
    }
    if (password.length > crypto_1.MAX_PASSWORD_LENGTH) {
        return { valid: false, error: 'La contraseña excede la longitud máxima permitida.' };
    }
    return { valid: true };
}
function deriveSanitizedBaseUid(usernameLower) {
    return `usr_${usernameLower.replace(/[^a-z0-9]/g, '_')}`;
}
function deriveDisambiguatedUid(usernameLower) {
    const base = deriveSanitizedBaseUid(usernameLower);
    const suffix = crypto.createHash('sha256').update(Buffer.from(usernameLower, 'utf8')).digest('hex').slice(0, 8);
    return `${base}_${suffix}`;
}
function mapKnownError(err) {
    if (err instanceof AccountServiceError) {
        throw err;
    }
    if (err instanceof rateLimit_1.RateLimitExceededError) {
        throw new AccountServiceError('resource-exhausted', err.message);
    }
    if (err instanceof crypto_1.ScryptBusyError) {
        throw new AccountServiceError('resource-exhausted', err.message);
    }
    throw err;
}
async function registerPasswordAccount(deps, input) {
    try {
        const usernameCheck = validateUsernameFormat(input.username);
        if (!usernameCheck.valid || !usernameCheck.cleanUsername) {
            throw new AccountServiceError('invalid-argument', usernameCheck.error || 'Nombre de usuario inválido.');
        }
        const passwordCheck = validatePasswordInput(input.password);
        if (!passwordCheck.valid) {
            throw new AccountServiceError('invalid-argument', passwordCheck.error || 'Contraseña inválida.');
        }
        const cleanUsername = usernameCheck.cleanUsername;
        const usernameLower = cleanUsername.toLowerCase();
        const password = input.password;
        const limiter = deps.limiter ?? crypto_1.defaultScryptLimiter;
        const nowMs = deps.nowMs ?? Date.now();
        const nowIso = new Date(nowMs).toISOString();
        await (0, rateLimit_1.enforceRateLimitBeforeKdf)(deps.db, {
            action: 'register',
            accountIdentifier: usernameLower,
            accountScope: 'account',
            ipAddress: deps.ipAddress,
            pepper: deps.pepper,
            nowMs,
            policyOverride: deps.rateLimitOverrides?.register,
        });
        const credential = await (0, crypto_1.createScryptCredential)(password, deps.pepper, limiter);
        const baseUid = deriveSanitizedBaseUid(usernameLower);
        const disambiguatedUid = deriveDisambiguatedUid(usernameLower);
        const finalUid = await deps.db.runTransaction(async (tx) => {
            const secretRef = deps.db.collection('accountSecrets').doc(usernameLower);
            const legacyRef = deps.db.collection('accounts').doc(usernameLower);
            const baseSecurityRef = deps.db.collection('userSecurity').doc(baseUid);
            const baseUserRef = deps.db.collection('users').doc(baseUid);
            const baseLegacyByUidQuery = deps.db.collection('accounts').where('userId', '==', baseUid).limit(1);
            const [secretSnap, legacySnap, baseSecuritySnap, baseUserSnap, baseLegacyByUidSnap] = await Promise.all([
                tx.get(secretRef),
                tx.get(legacyRef),
                tx.get(baseSecurityRef),
                tx.get(baseUserRef),
                tx.get(baseLegacyByUidQuery),
            ]);
            if (secretSnap.exists || legacySnap.exists) {
                throw new AccountServiceError('already-exists', `El nombre de usuario "${cleanUsername}" ya está en uso. Por favor, elige otro o inicia sesión.`);
            }
            let chosenUid = baseUid;
            const baseUidOccupied = baseSecuritySnap.exists || baseUserSnap.exists || !baseLegacyByUidSnap.empty;
            if (baseUidOccupied) {
                // Colisión de sanitización (ej. juan.perez vs juan-perez): aislar mediante UID determinista desambiguado.
                const disSecRef = deps.db.collection('userSecurity').doc(disambiguatedUid);
                const disUserRef = deps.db.collection('users').doc(disambiguatedUid);
                const disLegacyQuery = deps.db.collection('accounts').where('userId', '==', disambiguatedUid).limit(1);
                const [disSecSnap, disUserSnap, disLegacySnap] = await Promise.all([
                    tx.get(disSecRef),
                    tx.get(disUserRef),
                    tx.get(disLegacyQuery),
                ]);
                if (disSecSnap.exists || disUserSnap.exists || !disLegacySnap.empty) {
                    throw new AccountServiceError('already-exists', 'No fue posible asignar un identificador único para ese nombre de usuario. Elige otro.');
                }
                chosenUid = disambiguatedUid;
            }
            const securityRef = deps.db.collection('userSecurity').doc(chosenUid);
            const userRef = deps.db.collection('users').doc(chosenUid);
            const secretDoc = {
                userId: chosenUid,
                username: cleanUsername,
                usernameLower,
                kdfVersion: credential.kdfVersion,
                kdfParams: credential.kdfParams,
                salt: credential.salt,
                passwordHash: credential.passwordHash,
                sessionEpoch: 1,
                createdAt: nowIso,
                updatedAt: nowIso,
            };
            const securityDoc = {
                uid: chosenUid,
                usernameLower,
                minSessionEpoch: 1,
                createdAt: nowIso,
                updatedAt: nowIso,
            };
            tx.set(secretRef, secretDoc);
            tx.set(securityRef, securityDoc);
            tx.set(userRef, {
                uid: chosenUid,
                displayName: cleanUsername,
                createdAt: nowIso,
                updatedAt: nowIso,
            }, { merge: true });
            return chosenUid;
        });
        const customToken = await deps.auth.createCustomToken(finalUid, {
            provider: 'nita_password',
            sessionEpoch: 1,
        });
        return {
            customToken,
            uid: finalUid,
            displayName: cleanUsername,
            sessionEpoch: 1,
        };
    }
    catch (err) {
        return mapKnownError(err);
    }
}
function isValidPositiveEpoch(value) {
    return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 1;
}
function assertValidUserSecurityDoc(data, expectedUid, expectedUsernameLower) {
    if (!data || typeof data !== 'object') {
        throw new AccountServiceError('failed-precondition', 'El documento de seguridad es inválido o está vacío.');
    }
    const sec = data;
    if (typeof sec.uid !== 'string' || !sec.uid.startsWith('usr_') || sec.uid !== expectedUid) {
        throw new AccountServiceError('failed-precondition', 'El documento de seguridad no corresponde al identificador de la cuenta.');
    }
    if (typeof sec.usernameLower !== 'string' || sec.usernameLower.trim().length < 3) {
        throw new AccountServiceError('failed-precondition', 'El documento de seguridad no contiene un usuario válido.');
    }
    if (expectedUsernameLower !== undefined && sec.usernameLower !== expectedUsernameLower) {
        throw new AccountServiceError('failed-precondition', 'Conflicto de identificador de usuario en el documento de seguridad.');
    }
    if (!isValidPositiveEpoch(sec.minSessionEpoch)) {
        throw new AccountServiceError('failed-precondition', 'La época mínima de sesión en el documento de seguridad es inválida.');
    }
    return sec;
}
async function signInWithPasswordCustomToken(deps, input) {
    try {
        const usernameCheck = validateUsernameFormat(input.username);
        if (!usernameCheck.valid || !usernameCheck.cleanUsername) {
            throw new AccountServiceError('invalid-argument', usernameCheck.error || 'Nombre de usuario inválido.');
        }
        if (typeof input.password !== 'string' || input.password.length === 0) {
            throw new AccountServiceError('invalid-argument', 'Por favor, ingresa tu contraseña.');
        }
        if (input.password.length > crypto_1.MAX_PASSWORD_LENGTH) {
            throw new AccountServiceError('invalid-argument', 'La contraseña excede la longitud máxima permitida.');
        }
        const cleanUsername = usernameCheck.cleanUsername;
        const usernameLower = cleanUsername.toLowerCase();
        const password = input.password;
        const limiter = deps.limiter ?? crypto_1.defaultScryptLimiter;
        const nowMs = deps.nowMs ?? Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const { accountBucketKey } = await (0, rateLimit_1.enforceRateLimitBeforeKdf)(deps.db, {
            action: 'signin',
            accountIdentifier: usernameLower,
            accountScope: 'account',
            ipAddress: deps.ipAddress,
            pepper: deps.pepper,
            nowMs,
            policyOverride: deps.rateLimitOverrides?.signin,
        });
        const secretRef = deps.db.collection('accountSecrets').doc(usernameLower);
        const legacyRef = deps.db.collection('accounts').doc(usernameLower);
        const [secretSnap, legacySnap] = await Promise.all([secretRef.get(), legacyRef.get()]);
        if (!secretSnap.exists && !legacySnap.exists) {
            throw new AccountServiceError('unauthenticated', 'Usuario o contraseña incorrectos.');
        }
        const legacyData = legacySnap.exists ? legacySnap.data() : null;
        // Caso 1: Existe credencial moderna en /accountSecrets/{usernameLower}
        if (secretSnap.exists) {
            const secretData = secretSnap.data();
            if (typeof secretData.userId !== 'string' ||
                !secretData.userId.startsWith('usr_') ||
                secretData.userId.length <= 4 ||
                secretData.usernameLower !== usernameLower ||
                secretData.kdfVersion !== 'scrypt_v1' ||
                !(0, crypto_1.isValidScryptV1Format)(secretData.passwordHash, secretData.salt) ||
                !isValidPositiveEpoch(secretData.sessionEpoch)) {
                throw new AccountServiceError('failed-precondition', 'La cuenta presenta metadatos inconsistentes.');
            }
            if (legacyData &&
                (typeof legacyData.userId !== 'string' ||
                    legacyData.userId !== secretData.userId ||
                    (legacyData.usernameLower !== undefined && legacyData.usernameLower !== usernameLower))) {
                throw new AccountServiceError('failed-precondition', 'Se detectó una inconsistencia de identidad en la cuenta.');
            }
            // Corrección A: Fallo cerrado estricto de /userSecurity/{uid} (nunca reconstruir ni emitir token ante ausencia o discrepancia)
            const secRef = deps.db.collection('userSecurity').doc(secretData.userId);
            const secSnap = await secRef.get();
            if (!secSnap.exists) {
                throw new AccountServiceError('failed-precondition', 'La cuenta no posee un documento de seguridad válido.');
            }
            const secData = assertValidUserSecurityDoc(secSnap.data(), secretData.userId, usernameLower);
            if (secretData.sessionEpoch !== secData.minSessionEpoch) {
                throw new AccountServiceError('failed-precondition', 'Inconsistencia entre la época de la credencial y el documento de seguridad.');
            }
            const isValid = await (0, crypto_1.verifyScryptCredential)(password, secretData.passwordHash, secretData.salt, deps.pepper, limiter);
            if (!isValid) {
                throw new AccountServiceError('unauthenticated', 'Usuario o contraseña incorrectos.');
            }
            await (0, rateLimit_1.resetAccountRateLimit)(deps.db, accountBucketKey, nowMs);
            const customToken = await deps.auth.createCustomToken(secretData.userId, {
                provider: 'nita_password',
                sessionEpoch: secretData.sessionEpoch,
            });
            return {
                customToken,
                uid: secretData.userId,
                displayName: typeof secretData.username === 'string' ? secretData.username : cleanUsername,
                sessionEpoch: secretData.sessionEpoch,
            };
        }
        // Caso 2: Cuenta heredada únicamente en /accounts/{usernameLower} -> migración perezosa segura sin reducción de épocas
        if (!legacyData ||
            typeof legacyData.userId !== 'string' ||
            !legacyData.userId.startsWith('usr_') ||
            legacyData.userId.length <= 4 ||
            (legacyData.usernameLower !== undefined && legacyData.usernameLower !== usernameLower)) {
            throw new AccountServiceError('failed-precondition', 'La cuenta heredada está incompleta o dañada.');
        }
        if (typeof legacyData.salt !== 'string' || typeof legacyData.passwordHash !== 'string') {
            throw new AccountServiceError('failed-precondition', 'La cuenta heredada no contiene credenciales verificables.');
        }
        const legacyUid = legacyData.userId;
        const legacyUsername = typeof legacyData.username === 'string' && legacyData.username.trim().length > 0
            ? legacyData.username.trim()
            : cleanUsername;
        const secRef = deps.db.collection('userSecurity').doc(legacyUid);
        const [secSnap, secretsByUidSnap, legacyByUidSnap] = await Promise.all([
            secRef.get(),
            deps.db.collection('accountSecrets').where('userId', '==', legacyUid).limit(2).get(),
            deps.db.collection('accounts').where('userId', '==', legacyUid).limit(2).get(),
        ]);
        if (secSnap.exists) {
            assertValidUserSecurityDoc(secSnap.data(), legacyUid, usernameLower);
        }
        if (secretsByUidSnap.docs.some((d) => d.id !== usernameLower)) {
            throw new AccountServiceError('failed-precondition', 'El identificador histórico está asociado a otra cuenta migrada.');
        }
        if (legacyByUidSnap.docs.some((d) => d.id !== usernameLower)) {
            throw new AccountServiceError('failed-precondition', 'Existen cuentas heredadas duplicadas para el mismo identificador.');
        }
        const legacyVerification = (0, crypto_1.verifyLegacyCredential)(password, legacyData.passwordHash, legacyData.salt);
        if (legacyVerification.format === 'malformed') {
            throw new AccountServiceError('failed-precondition', 'Formato de credencial heredada incompatible o corrupto.');
        }
        if (!legacyVerification.valid) {
            throw new AccountServiceError('unauthenticated', 'Usuario o contraseña incorrectos.');
        }
        const newCredential = await (0, crypto_1.createScryptCredential)(password, deps.pepper, limiter);
        const effectiveEpoch = await deps.db.runTransaction(async (tx) => {
            const [txLegacySnap, txSecretSnap, txSecSnap] = await Promise.all([
                tx.get(legacyRef),
                tx.get(secretRef),
                tx.get(secRef),
            ]);
            // Corrección C: validar /userSecurity/{legacyUid} dentro de la transacción y preservar su época mínima sin reducirla
            let existingSecurity = null;
            if (txSecSnap.exists) {
                existingSecurity = assertValidUserSecurityDoc(txSecSnap.data(), legacyUid, usernameLower);
            }
            if (txSecretSnap.exists) {
                const existingSecret = txSecretSnap.data();
                if (existingSecret.userId !== legacyUid ||
                    existingSecret.usernameLower !== usernameLower ||
                    !isValidPositiveEpoch(existingSecret.sessionEpoch) ||
                    !existingSecurity ||
                    existingSecret.sessionEpoch !== existingSecurity.minSessionEpoch) {
                    throw new AccountServiceError('failed-precondition', 'Inconsistencia detectada durante la migración.');
                }
                return existingSecret.sessionEpoch;
            }
            if (!txLegacySnap.exists) {
                throw new AccountServiceError('aborted', 'La cuenta fue modificada durante el inicio de sesión.');
            }
            const targetEpoch = existingSecurity ? existingSecurity.minSessionEpoch : 1;
            const secretDoc = {
                userId: legacyUid,
                username: legacyUsername,
                usernameLower,
                kdfVersion: newCredential.kdfVersion,
                kdfParams: newCredential.kdfParams,
                salt: newCredential.salt,
                passwordHash: newCredential.passwordHash,
                sessionEpoch: targetEpoch,
                migratedFrom: legacyVerification.format === 'legacy_fallback' ? 'legacy_fallback' : 'sha256',
                createdAt: typeof legacyData.createdAt === 'string' ? legacyData.createdAt : nowIso,
                updatedAt: nowIso,
            };
            tx.set(secretRef, secretDoc);
            if (existingSecurity) {
                // Jamás reducir ni sobrescribir una época preexistente en /userSecurity/{uid}
                tx.update(secRef, {
                    updatedAt: nowIso,
                });
            }
            else {
                const securityDoc = {
                    uid: legacyUid,
                    usernameLower,
                    minSessionEpoch: 1,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                };
                tx.set(secRef, securityDoc);
            }
            tx.update(legacyRef, {
                passwordHash: firestore_1.FieldValue.delete(),
                salt: firestore_1.FieldValue.delete(),
                migrated: true,
                migratedAt: nowIso,
                updatedAt: nowIso,
            });
            return targetEpoch;
        });
        await (0, rateLimit_1.resetAccountRateLimit)(deps.db, accountBucketKey, nowMs);
        const customToken = await deps.auth.createCustomToken(legacyUid, {
            provider: 'nita_password',
            sessionEpoch: effectiveEpoch,
        });
        return {
            customToken,
            uid: legacyUid,
            displayName: legacyUsername,
            sessionEpoch: effectiveEpoch,
            migratedFrom: legacyVerification.format === 'legacy_fallback' ? 'legacy_fallback' : 'sha256',
        };
    }
    catch (err) {
        return mapKnownError(err);
    }
}
async function changePassword(deps, input) {
    try {
        if (!input.callerUid || typeof input.callerUid !== 'string' || !input.callerUid.startsWith('usr_') || input.callerUid.length <= 4) {
            throw new AccountServiceError('unauthenticated', 'Debes iniciar sesión con tu cuenta NITA para cambiar la contraseña.');
        }
        // Corrección B.1: exigir tokenProvider === 'nita_password' de forma estricta
        if (input.tokenProvider !== 'nita_password') {
            throw new AccountServiceError('permission-denied', 'Solo las cuentas autenticadas con contraseña NITA pueden cambiar su clave aquí.');
        }
        // Corrección B.2: exigir tokenSessionEpoch entero, finito y positivo
        if (!isValidPositiveEpoch(input.tokenSessionEpoch)) {
            throw new AccountServiceError('unauthenticated', 'Tu sesión no posee una época de seguridad válida. Vuelve a iniciar sesión.');
        }
        if (typeof input.currentPassword !== 'string' || input.currentPassword.length === 0 || input.currentPassword.length > crypto_1.MAX_PASSWORD_LENGTH) {
            throw new AccountServiceError('invalid-argument', 'Por favor, ingresa tu contraseña actual.');
        }
        const newPassCheck = validatePasswordInput(input.newPassword);
        if (!newPassCheck.valid) {
            throw new AccountServiceError('invalid-argument', newPassCheck.error || 'La nueva contraseña no es válida.');
        }
        const callerUid = input.callerUid;
        const callerSessionEpoch = input.tokenSessionEpoch;
        const currentPassword = input.currentPassword;
        const newPassword = input.newPassword;
        const limiter = deps.limiter ?? crypto_1.defaultScryptLimiter;
        const nowMs = deps.nowMs ?? Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const { accountBucketKey } = await (0, rateLimit_1.enforceRateLimitBeforeKdf)(deps.db, {
            action: 'change_password',
            accountIdentifier: callerUid,
            accountScope: 'uid',
            ipAddress: deps.ipAddress,
            pepper: deps.pepper,
            nowMs,
            policyOverride: deps.rateLimitOverrides?.change_password,
        });
        // Corrección B.3-6: exigir /userSecurity/{uid} existente y consistente (sin reconstrucción ni fallback)
        const secRef = deps.db.collection('userSecurity').doc(callerUid);
        const secSnap = await secRef.get();
        if (!secSnap.exists) {
            throw new AccountServiceError('failed-precondition', 'No se encontró el documento de seguridad de la cuenta.');
        }
        const secData = assertValidUserSecurityDoc(secSnap.data(), callerUid);
        const usernameLower = secData.usernameLower;
        const secretRef = deps.db.collection('accountSecrets').doc(usernameLower);
        const secretSnap = await secretRef.get();
        if (!secretSnap.exists) {
            throw new AccountServiceError('failed-precondition', 'No se encontró el registro de credenciales de la cuenta.');
        }
        const secretData = secretSnap.data();
        if (secretData.userId !== callerUid ||
            secretData.usernameLower !== usernameLower ||
            secretData.kdfVersion !== 'scrypt_v1' ||
            !(0, crypto_1.isValidScryptV1Format)(secretData.passwordHash, secretData.salt) ||
            !isValidPositiveEpoch(secretData.sessionEpoch)) {
            throw new AccountServiceError('failed-precondition', 'Los metadatos de credenciales de la cuenta son inválidos.');
        }
        if (secretData.sessionEpoch !== secData.minSessionEpoch) {
            throw new AccountServiceError('failed-precondition', 'Los documentos de seguridad y credenciales tienen épocas inconsistentes.');
        }
        if (callerSessionEpoch !== secData.minSessionEpoch) {
            throw new AccountServiceError('unauthenticated', 'Tu sesión actual fue revocada o es obsoleta. Vuelve a iniciar sesión.');
        }
        const currentValid = await (0, crypto_1.verifyScryptCredential)(currentPassword, secretData.passwordHash, secretData.salt, deps.pepper, limiter);
        if (!currentValid) {
            throw new AccountServiceError('unauthenticated', 'La contraseña actual ingresada es incorrecta.');
        }
        const newCredential = await (0, crypto_1.createScryptCredential)(newPassword, deps.pepper, limiter);
        const expectedEpoch = secData.minSessionEpoch;
        const nextEpoch = await deps.db.runTransaction(async (tx) => {
            const [txSecretSnap, txSecSnap] = await Promise.all([tx.get(secretRef), tx.get(secRef)]);
            if (!txSecretSnap.exists || !txSecSnap.exists) {
                throw new AccountServiceError('failed-precondition', 'Faltan registros de seguridad obligatorios para completar el cambio.');
            }
            const latestSec = assertValidUserSecurityDoc(txSecSnap.data(), callerUid, usernameLower);
            const latestSecret = txSecretSnap.data();
            if (latestSecret.userId !== callerUid ||
                latestSecret.usernameLower !== usernameLower ||
                !isValidPositiveEpoch(latestSecret.sessionEpoch)) {
                throw new AccountServiceError('failed-precondition', 'Los metadatos de la credencial son inválidos.');
            }
            if (latestSecret.sessionEpoch !== expectedEpoch || latestSec.minSessionEpoch !== expectedEpoch) {
                throw new AccountServiceError('aborted', 'Se detectó un cambio concurrente en la sesión. Intenta nuevamente.');
            }
            const bumpedEpoch = expectedEpoch + 1;
            tx.update(secretRef, {
                kdfVersion: newCredential.kdfVersion,
                kdfParams: newCredential.kdfParams,
                salt: newCredential.salt,
                passwordHash: newCredential.passwordHash,
                sessionEpoch: bumpedEpoch,
                updatedAt: nowIso,
            });
            tx.update(secRef, {
                minSessionEpoch: bumpedEpoch,
                updatedAt: nowIso,
            });
            return bumpedEpoch;
        });
        await deps.auth.revokeRefreshTokens(callerUid);
        const customToken = await deps.auth.createCustomToken(callerUid, {
            provider: 'nita_password',
            sessionEpoch: nextEpoch,
        });
        await (0, rateLimit_1.resetAccountRateLimit)(deps.db, accountBucketKey, nowMs);
        return {
            customToken,
            uid: callerUid,
            sessionEpoch: nextEpoch,
        };
    }
    catch (err) {
        return mapKnownError(err);
    }
}
//# sourceMappingURL=accountService.js.map