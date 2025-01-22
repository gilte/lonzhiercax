const { parentPort, workerData } = require('worker_threads'); // Acessa os dados do worker
const elliptic = require('elliptic'); // Biblioteca para EC (curvas elípticas)
const CryptoJS = require('crypto-js'); // Biblioteca de criptografia

// Desestrutura os dados passados para o worker
const { rangeStart, rangeEnd, targetHash, minStep, maxStep } = workerData;

const EC = elliptic.ec;
const ec = new EC('secp256k1');

const start = BigInt("0x" + rangeStart);
const end = BigInt("0x" + rangeEnd);
const stepMin = BigInt(minStep); // Passa o step mínimo como BigInt
const stepMax = BigInt(maxStep); // Passa o step máximo como BigInt

let currentStep = start;
let keysTested = 0;
let lastUpdateTime = Date.now();
let found = false; // Flag para verificar se a chave foi encontrada

function getRandomStep() {
    return BigInt(Math.floor(Math.random() * (Number(stepMax - stepMin) + 1)) + Number(stepMin));
}

while (currentStep <= end) {
    const privateKeyHex = currentStep.toString(16).padStart(64, '0');
    const privateKeyBigInt = BigInt("0x" + privateKeyHex);

    if (privateKeyBigInt <= 0n || privateKeyBigInt >= ec.curve.n) {
        currentStep += getRandomStep(); // Utiliza o passo aleatório
        if (currentStep > end) currentStep = start; // Reinicia o intervalo
        continue;
    }

    try {
        const keyPair = ec.keyFromPrivate(privateKeyHex);
        const publicKey = keyPair.getPublic(true, 'hex');
        const sha256Hash = CryptoJS.SHA256(CryptoJS.enc.Hex.parse(publicKey));
        const ripemd160Hash = CryptoJS.RIPEMD160(sha256Hash).toString();

        // Verifica se o hash gerado é igual ao targetHash
        if (ripemd160Hash === targetHash) {
            parentPort.postMessage({ type: 'found', privateKey: privateKeyHex });
            found = true; // Marca como encontrado
            break; // Encerra o loop se encontrar a chave
        }

        const significantPrivateKeyHex = privateKeyHex.replace(/^0+/, '');
        parentPort.postMessage({
            type: 'update',
            message: `Base Key: ${significantPrivateKeyHex}`,
        });

        keysTested++;

        // Atualiza a cada 1000 chaves testadas
        if (keysTested % 1000n === 0n) {
            const currentTime = Date.now();
            const elapsedTime = (currentTime - lastUpdateTime) / 1000; // Tempo em segundos
            const keysPerSecond = elapsedTime > 0 ? keysTested / elapsedTime : 0;

            parentPort.postMessage({
                type: 'update',
                message: `Keys per second: ${Math.round(keysPerSecond)}`,
            });

            lastUpdateTime = currentTime;
            keysTested = 0;
        }

    } catch (error) {
        parentPort.postMessage({
            type: 'error',
            message: `Error at step ${currentStep.toString(16).padStart(64, '0')}: ${error.message}`,
        });
    }

    currentStep += getRandomStep(); // Avança a chave de acordo com o passo aleatório

    if (currentStep > end) {
        currentStep = start; // Reinicia o intervalo
    }
}

if (!found) {
    parentPort.postMessage({ type: 'finished', message: 'Search completed. No match found.' });
}
