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

}

class Point {

    x;
    y;

    ec;

    constructor(x, y, ec) {
        this.x = x;
        this.y = y;
        this.ec = ec;
        if(!ec.contains(x,y)) throw new Error("Not on curve!");
    }

    inverse() {
        return new Point(
            this.x,
            this.ec.field.mul(this.y, new BN(-1)),
            this.ec
        );
    }

    eq(p2) {
        const p1 = this;

        if(p1==null && p2==null) return true;
        if(p1==null || p2==null) return false;

        return p1.x.eq(p2.x) && p1.y.eq(p2.y);
    }

    static _add(p1, p2, ec) {
        if(p1==null) return p2;
        if(p2==null) return p1;

        const p1inv = p1.inverse();
        if(p1inv.eq(p2)) {
            return null;
        }

        let lambda;

        if(p1.eq(p2)) {
            lambda = ec.field.div(
                ec.field.add(
                    ec.field.mul(
                        new BN(3),
                        ec.field.pow(
                            p1.x,
                            new BN(2)
                        )
                    ),
                    ec.a
                ),
                ec.field.mul(p1.y, new BN(2))
            );
            // console.log("Lambda: ", lambda);
        } else {
            lambda = ec.field.div(
                ec.field.sub(
                    p2.y,
                    p1.y
                ),
                ec.field.sub(
                    p2.x,
                    p1.x
                )
            );
            // console.log("NEQ Lambda: ", lambda);
        }

        const x3 = ec.field.sub(
            ec.field.sub(
                ec.field.pow(lambda, new BN(2)),
                p1.x
            ),
            p2.x
        );

        const y3 = ec.field.sub(
            ec.field.mul(
                ec.field.sub(p1.x, x3),
                lambda
            ),
            p1.y
        );

        if(x3==null || y3==null) return null;

        return new Point(x3, y3, ec);
    }

    add(p2) {
        return Point._add(this, p2, this.ec);
    }

    scalarMul(num) {
        let point = this;
        for(let i= new BN(1); i.lt(num); i=i.add(new BN(1))) {
            point = this.add(point);
        }
        return point;
    }

    fastScalarMul(num) {
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
            point = point.add(point);
        }

        return sum;
    }


    fastScalarMul2(num) {
        let sum = null;

        let point = this;
        for(let i=0;i<256;i++) {
            //Double the sum
            sum = Point._add(sum, sum, this.ec);

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

const shamirMultArr = [];

for(let i=0;i<32;i++) {
    shamirMultArr.push({point: ecdsa.randomPoint(), scalar: ecdsa.randomKey()});
}

let dateStart = Date.now();
let resultPoint1 = null;
for(let entry of shamirMultArr) {
    resultPoint1 = entry.point.fastScalarMul2(entry.scalar).add(resultPoint1);
}
console.log("dT1: ", Date.now()-dateStart);

console.log("Result point 1: ", resultPoint1);


dateStart = Date.now();
const resultPoint2 = ec.shamirScalarMultiplication(shamirMultArr);
console.log("dT2: ", Date.now()-dateStart);

console.log("Result point 2: ", resultPoint2);
