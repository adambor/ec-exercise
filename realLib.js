const secp256k1 = require('secp256k1');
const crypto = require("crypto");

const privKey = Buffer.from("b06e946dd62d61051d9ca80cef7077a0c6f707c1d3dd789049bc749121e69c53", "hex");

const pubKey = secp256k1.publicKeyCreate(privKey);

console.log("Public key: ", Buffer.from(pubKey).toString("hex"));

const message = "Hello world";
const msgHash = crypto.createHash("sha256").update(message).digest();

const signature = {
    r: "564128bb16b15cadbd0d9ff68f57e6daff6163ad433ea5a9d96da35d558a0bc0",
    s: "e7a906a11286bd00eaaf13d3104927836dedb7b082593c7d120ad794786ccea1"
};

const generatedSignature = secp256k1.ecdsaSign(msgHash, privKey, {
    noncefn: () => new Uint8Array(Buffer.from("83bbf05b5a2188733f8258f23c3a75cce94f8350bc1698bb40bdb116a385296f", "hex"))
})

console.log("Generated signature: ", Buffer.from(generatedSignature.signature).toString("hex"));

console.log("Valid signature: ", secp256k1.ecdsaVerify(Buffer.from(signature.r + signature.s, "hex"), msgHash, pubKey))