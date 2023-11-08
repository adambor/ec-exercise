const BN = require("bn.js");
const crypto = require("crypto");

class FF {

    mod;
    constructor(mod) {
        this.mod = mod;
    }

    mul(a, b) {
        if(a==null || b==null) return null;
        return a.mul(b).mod(this.mod);
    }

    pow(a, b) {
        if(a==null || b==null) return null;
        return a.pow(b).mod(this.mod);
    }

    add(a, b) {
        if(a==null || b==null) return null;
        return a.add(b).mod(this.mod);
    }

    sub(a, b) {
        if(a==null || b==null) return null;
        return this.add(a.add(this.mod), this.mul(b, new BN(-1)));
    }

    div(a, b) {
        if(a==null || b==null) return null;
        return this.mul(a, this.invert(b));
    }

    invert(a) {
        return FF.invertMod(a, this.mod)
    }

    static random(mod) {
        return new BN(crypto.randomBytes(32).toString("hex"), 16).mod(mod);
    }

    static invertMod(a, mod) {
        if(a==null) return null;
        let t = new BN(0);
        let r = mod;
        let newT = new BN(1);
        let newR = a;

        while(!newR.eq(new BN(0))) {
            const quotient = r.div(newR);
            const _newT = t.sub(quotient.mul(newT));
            t = newT;
            newT = _newT;
            const _newR = r.sub(quotient.mul(newR));
            r = newR;
            newR = _newR;
        }

        if(r.gt(new BN(1))) {
            return null;
        }
        if(t.lt(new BN(0))) {
            return t.add(mod);
        }
        return t;
    }

}

class EC {

    a;
    b;

    field;

    constructor(a, b, field) {
        this.a = a;
        this.b = b;
        this.field = field;
    }

    contains(x, y) {
        const ls = this.field.pow(y, new BN(2));
        const rs = this.field.add(
            this.field.add(
                this.field.pow(x, new BN(3)),
                this.field.mul(this.a, x)
            ),
            this.b
        );
        return ls.eq(rs);
    }

    shamirScalarMultiplication(arr) {
        const cache = {};
        let sum = null;
        for(let i=0;i<256;i++) {
            sum = Point._add(sum, sum, this);

            let bitmask = new BN(0);
            for(let e=0;e<arr.length;e++) {
                const num = arr[e].scalar;
                bitmask = bitmask.shln(1).or(num.shrn(255-i).and(new BN(1)));
            }

            const bitmaskStr = bitmask.toString();

            if(cache[bitmaskStr]==null) {
                let cachedSum = null;
                for(let e=0;e<arr.length;e++) {
                    if(bitmask.shrn(arr.length-e-1).and(new BN(1)).eq(new BN(1))) {
                        cachedSum = arr[e].point.add(cachedSum);
                    }
                }
                cache[bitmaskStr] = cachedSum;
            }

            sum = Point._add(sum, cache[bitmaskStr], this);
        }
        return sum;
    }

    shamirScalarMultiplicationNoCache(arr) {
        const cache = {};
        let sum = null;
        for(let i=0;i<256;i++) {
            sum = Point._add(sum, sum, this);

            let toSum = null;
            for(let e=0;e<arr.length;e++) {
                const num = arr[e].scalar;
                if(num.shrn(255-i).and(new BN(1)).eq(new BN(1))) {
                    toSum = Point._add(toSum, arr[e].point, this);
                }
            }

            sum = Point._add(sum, toSum, this);
        }
        return sum;
    }

}

class Point {

    jakX;
    jakY;
    jakZ;

    ec;

    constructor(x, y, zOrEc, ec) {
        if(zOrEc instanceof EC) {
            //Transfer to jakobian
            this.ec = zOrEc;
            if(!this.ec.contains(x,y)) throw new Error("Not on curve!");
            this.jakX = x;
            this.jakY = y;
            this.jakZ = new BN(1);
        } else {
            this.jakX = x;
            this.jakY = y;
            this.jakZ = zOrEc;
            this.ec = ec;
        }
    }

    zInvCache;

    calcZInv() {
        if(this.zInvCache==null || !this.zInvCache.z.eq(this.jakZ)) {
            this.zInvCache = {
                z: this.jakZ,
                zInv: this.ec.field.invert(this.jakZ)
            };
        }
    }

    get x() {
        this.calcZInv();
        return this.ec.field.mul(
            this.jakX,
            this.ec.field.pow(this.zInvCache.zInv, new BN(2))
        );
    }

    get y() {
        this.calcZInv();
        return this.ec.field.mul(
            this.jakY,
            this.ec.field.pow(this.zInvCache.zInv, new BN(3))
        );
    }

    inverse() {
        return new Point(
            this.jakX,
            this.ec.field.mul(this.jakY, new BN(-1)),
            this.jakZ,
            this.ec
        );
    }

    eq(p2) {
        const p1 = this;

        if(p1==null && p2==null) return true;
        if(p1==null || p2==null) return false;

        return p1.x.eq(p2.x) && p1.y.eq(p2.y);
    }

    static _double(p1, ec) {
        if(p1==null) return null;
        const S = ec.field.mul(
            ec.field.mul(
                new BN(4),
                p1.jakX
            ),
            ec.field.pow(p1.jakY, new BN(2))
        );
        const Z2 = ec.field.pow(p1.jakZ, new BN(2));
        const Z4 = ec.field.pow(Z2, new BN(2));
        const M = ec.field.add(
            ec.field.mul(
                new BN(3),
                ec.field.pow(p1.jakX, new BN(2))
            ),
            ec.field.mul(
                ec.a,
                Z4
            )
        );
        const x = ec.field.sub(
            ec.field.pow(M, new BN(2)),
            ec.field.mul(S, new BN(2))
        );
        const Y2 = ec.field.pow(p1.jakY, new BN(2));
        const y = ec.field.sub(
            ec.field.mul(
                M,
                ec.field.sub(
                    S,
                    x
                )
            ),
            ec.field.mul(
                new BN(8),
                ec.field.pow(Y2, new BN(2))
            )
        );
        const z = ec.field.mul(
            new BN(2),
            ec.field.mul(
                p1.jakY,
                p1.jakZ
            )
        );

        return new Point(x, y, z, ec);
    }

    double() {
        return Point._double(this, this.ec);
    }

    static _add(p1, p2, ec) {
        if(p1==null) return p2;
        if(p2==null) return p1;

        const A = ec.field.mul(
            p1.jakX,
            ec.field.pow(
                p2.jakZ,
                new BN(2)
            )
        );
        const B = ec.field.sub(
            ec.field.mul(
                p2.jakX,
                ec.field.pow(
                    p1.jakZ,
                    new BN(2)
                )
            ),
            A
        );

        const c = ec.field.mul(
            p1.jakY,
            ec.field.pow(
                p2.jakZ,
                new BN(3)
            )
        );

        const d = ec.field.sub(
            ec.field.mul(
                p2.jakY,
                ec.field.pow(
                    p1.jakZ,
                    new BN(3)
                )
            ),
            c
        );

        if(B.isZero()) {
            if(d.isZero()) {
                //Point doubling
                return Point._double(p1, p1.ec);
            } else {
                //Infinity
                return null;
            }
        }

        const z = ec.field.mul(
            ec.field.mul(
                p1.jakZ,
                p2.jakZ
            ),
            B
        );

        const x = ec.field.sub(
            ec.field.pow(d, new BN(2)),
            ec.field.mul(
                ec.field.pow(B, new BN(2)),
                ec.field.add(
                    B,
                    ec.field.mul(
                        new BN(2),
                        A
                    )
                )
            )
        );

        const y = ec.field.sub(
            ec.field.mul(
                d,
                ec.field.sub(
                    ec.field.mul(
                        A,
                        ec.field.pow(B, new BN(2))
                    ),
                    x
                )
            ),
            ec.field.mul(
                c,
                ec.field.pow(B, new BN(3))
            )
        );

        return new Point(x, y, z, ec);
    }

    add(p2) {
        return Point._add(this, p2, this.ec);
    }

    old_fastScalarMul(num) {
        let sum = null;

        let point = this;
        for(let i=0;i<256;i++) {
            if(num.shrn(i).and(new BN(1)).eq(new BN(1))) {
                // console.log("i: ", i);
                if(sum==null) {
                    sum = point;
                } else {
                    sum = sum.add(point);
                }
            }

            //Double the point
            point = point.double();
        }

        return sum;
    }

    fastScalarMul(num) {
        let sum = null;

        let point = this;
        for(let i=0;i<256;i++) {
            //Double the sum
            sum = sum==null ? null : sum.double();

            if(num.shrn(255-i).and(new BN(1)).eq(new BN(1))) {
                // console.log("i: ", i);
                if(sum==null) {
                    sum = point;
                } else {
                    sum = sum.add(point);
                }
            }
        }

        return sum;
    }

}

class ECDSA {

    ec;
    generator;
    order;

    constructor(ec, generator, order) {
        this.ec = ec;
        this.generator = generator;
        this.order = order;
    }

    randomPoint() {
        return this.toPublicKey(this.randomKey());
    }

    randomKey() {
        return FF.random(this.order);
    }

    toPublicKey(privKey) {
        return this.generator.fastScalarMul(privKey);
    }

    isValidPublicKey(publicKey) {
        if(!this.ec.contains(publicKey.x, publicKey.y)) return false;
        const point = publicKey.fastScalarMul(this.order);
        return point==null;
    }

    sign(privKey, messageDigest) {
        const e = new BN(messageDigest.toString("hex"), 16);
        const diff = e.bitLength() - this.order.bitLength();
        const z = diff>0 ? e.shrn(diff) : e;

        let k;
        let point;
        let r;
        let s;
        while(
            r==null ||
            r.eq(new BN(0)) ||
            s.eq(new BN(0))
        ) {
            k = this.randomKey();
            point = this.toPublicKey(k);
            r = point.x.mod(this.order);

            //s = k^-1 * (z + r * privKey)
            s = FF.invertMod(k, this.order).mul(z.add(r.mul(privKey))).mod(this.order);
        }

        return {
            r,
            s
        };
    }

    validFieldElementModOrder(a) {
        return a!=null && a.gt(new BN(0)) && a.lt(this.order);
    }

    verify(publicKey, messageDigest, signature) {
        if(!this.isValidPublicKey(publicKey)) return false;

        if(!this.validFieldElementModOrder(signature.r)) return false;
        if(!this.validFieldElementModOrder(signature.s)) return false;

        const e = new BN(messageDigest.toString("hex"), 16);
        const diff = e.bitLength() - this.order.bitLength();
        const z = diff>0 ? e.shrn(diff) : e;

        const sInv = FF.invertMod(signature.s, this.order);

        const u1 = z.mul(sInv).mod(this.order);
        const u2 = signature.r.mul(sInv).mod(this.order);

        const point = this.generator.fastScalarMul(u1).add(
            publicKey.fastScalarMul(u2)
        );

        if(point==null) return false;

        return signature.r.eq(point.x.mod(this.order));
    }

}

const ff = new FF(new BN("fffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f", 16));
const ec = new EC(new BN(0), new BN(7), ff);
const G = new Point(
    new BN("79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798", 16),
    new BN("483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8", 16),
    ec
);
const N = new BN("fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141", 16);

const ecdsa = new ECDSA(ec, G, N);

// const num = new BN("483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8", 16);
// console.log(ff.invert(num));

const privKey = new BN("b06e946dd62d61051d9ca80cef7077a0c6f707c1d3dd789049bc749121e69c53", 16);
let time = Date.now();
const publicKey = ecdsa.toPublicKey(privKey);
console.log("To pubkey: ", Date.now()-time);

console.log("Private key: ", privKey);
console.log("Public key: ", publicKey);

const message = "Hello world";
const msgHash = crypto.createHash("sha256").update(message).digest();

time = Date.now();
const signature = ecdsa.sign(privKey, msgHash);
console.log("Sig compute: ", Date.now()-time);

console.log("Signature: ", signature);

time = Date.now();
const verifySuccess = ecdsa.verify(publicKey, msgHash, signature);
console.log("Sig verify: ", Date.now()-time);

console.log("Verify: ", verifySuccess);

// console.log("Verify: ", ecdsa.verify(publicKey, msgHash, {
//     r: new BN("564128bb16b15cadbd0d9ff68f57e6daff6163ad433ea5a9d96da35d558a0bc0", 16),
//     s: new BN("4d5d0f20deb9c8c97d97dae908851b249760130662827c67331e41389aa579e4", 16)
// }));

const shamirMultArr = [];

for(let i=0;i<32;i++) {
    shamirMultArr.push({point: ecdsa.randomPoint(), scalar: ecdsa.randomKey()});
}


let dateStart = Date.now();
let resultPoint1 = null;
for(let entry of shamirMultArr) {
    resultPoint1 = entry.point.fastScalarMul(entry.scalar).add(resultPoint1);
}
console.log("dT1: ", Date.now()-dateStart);

console.log("Result point 1: ", resultPoint1.x, resultPoint1.y);


dateStart = Date.now();
const resultPoint2 = ec.shamirScalarMultiplication(shamirMultArr);
console.log("dT2: ", Date.now()-dateStart);

console.log("Result point 2: ", resultPoint2.x , resultPoint2.y);


dateStart = Date.now();
const resultPoint3 = ec.shamirScalarMultiplicationNoCache(shamirMultArr);
console.log("dT3: ", Date.now()-dateStart);

console.log("Result point 3: ", resultPoint3.x , resultPoint3.y);
