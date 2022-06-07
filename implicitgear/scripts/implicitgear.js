let _implicitgear = undefined; //for debugging purposes only.  don't write code with it

define([
    "util", "mesh", "const", "vectormath", "math"
], function (util, mesh, cconst, vectormath, math) {
    'use strict';

    const Vector2 = vectormath.Vector2;
    const Vector3 = vectormath.Vector3;
    const Matrix4 = vectormath.Matrix4;

    const exports = _implicitgear = {};

    let _ccache = {};

    let CTOT = 1;

    function dimensionIter(n, steps, depth = n, mask, t, list, starti = 0) {
        if (!list) {
            let key = "" + n + ":" + steps;

            if (key in _ccache) {
                return _ccache[key];
            }

            list = _ccache[key] = [];
        }

        if (!t) {
            t = [];

            for (let i = 0; i < steps; i++) {
                t.push(0.0);
            }
        }

        t = util.list(t); //copy it

        if (depth === 0) {
            list.push(t);

            return list;
        } else {
            for (let i = 0; i < steps; i++) {
                let t2 = i / (steps - 1);

                t[depth] = t2;

                dimensionIter(n, steps, depth - 1, mask, t, list, i);
            }
        }

        return list;

        let key = "" + n + ":" + steps;
        if (key in _ccache) {
            return _ccache[key];
        }

        list = _ccache[key] = [];
        let max = (1 << n) - 1;

        for (let mask = 1; mask <= max; mask++) {
            for (let j = 0; j < steps; j++) {
                let t = j / (steps - 1);

                let m = [];
                for (let k = 0; k < n; k++) {
                    if (mask & (1 << k)) {
                        m.push(k);
                    }
                }

                list.push([m, mask, t]);
            }
        }

        return list;
    }

    window.dimensionIter = dimensionIter;

    const GearCache = exports.GearCache = class GearCache {
        constructor() {
            this.running = false;
            this.timer = undefined;
            this.table = undefined;
        }

        reset() {
        }

        * genTask() {
            let state = _appstate;

            this.reset();

            let params1 = {
                pressure: 15,
                numteeth: 4,
                depth: 1,
            };

            let params2 = {
                pressure: 35,
                numteeth: 150,
                depth: 3,
            };

            let steps = 4;
            let keys = ["pressure", "depth", "numteeth"];

            let dimens = 3;

            let table = this.table = new Array(steps ** dimens);

            for (let ts of dimensionIter(dimens, steps)) {
                let params = Object.assign({}, params1);

                let idx = 0;
                for (let i = 0; i < dimens; i++) {
                    let j = ts[i] * (steps - 1);

                    idx |= j * steps ** (dimens - i - 1);
                }

                console.warn("IDX", idx, ts);

                for (let i = 0; i < ts.length; i++) {
                    let k = keys[i];
                    let t = ts[i];

                    let v1 = params1[k];
                    let v2 = params2[k];

                    params[k] = v1 + (v2 - v1) * t;
                }

                console.log("PARAMS", params);
                
                state.reset(params);
                let c = state.igear.extractCurve();
                table[idx] = c;

                yield;
            }

            state.reset();
            yield;
        }

        draw(canvas, g) {
        }

        toJSON() {
            return {
            };
        }

        loadJSON(obj) {
        }

        start() {
            if (this.running) {
                return;
            }

            console.warn("Starting task");

            this.running = true;
            this.task = this.genTask()[Symbol.iterator]();

            this.timer = window.setInterval(() => {
                let time = util.time_ms();
                while (util.time_ms() - time < 30) {
                    let ret;

                    try {
                        ret = this.task.next();
                    } catch (error) {
                        console.error(error.stack);
                        this.stop();
                        break;
                    }

                    if (ret.done) {
                        this.stop();
                        break;
                    }
                }

                window.redraw_all();
            }, 35);
        }

        stop() {
            if (!this.running) {
                return;
            }

            console.warn("Stopping task");

            this.running = false;
            window.clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    let Profile = exports.Profile = class Profile {
        constructor(numteeth, modulus) {
            this.pressureth = (20 / 180) * Math.PI;
            this.backlash = 0.1;
            this.modulus = modulus; //teeth width
            this.depth = 1.0 * (this.modulus * 2 / Math.PI);
            this.numteeth = numteeth;

            this.inner_gear_mode = false;

            this.genRadius();
        }

        genRadius() {
            this._dx = Math.sin(this.pressureth) * this.depth;
            this._dy = Math.cos(this.pressureth) * this.depth;

            this.radius = this.modulus * 2 * this.numteeth / Math.PI / 2;
            this.pitch_radius = this.radius;
        }

        hash() {
            this.genRadius();

            return this.depth.toFixed(5) + "," + this.pressureth.toFixed(5) + "," + this.modulus.toFixed(5) + "," + this.numteeth +
                "," + this.backlash.toFixed(5) + "," + this.inner_gear_mode;
        }
    };

    let ImplicitGear = exports.ImplicitGear = class ImplicitGear {
        //g is a Canvas2DContext
        constructor(g, profile, size = 64) {
            this.size = size;
            this.image = new ImageData(new Uint8ClampedArray(this.size * this.size * 4), this.size, this.size);

            this.profile = profile;

            profile.backlash *= 0.25;
            profile.backlash -= 0.0125; //magic number! have to do this for some reason

            let ilen = this.size * this.size * 4;
            let data = this.image.data;
            for (let i = 3; i < ilen; i += 4) {
                data[i] = 255;
            }

            this.fdata = new Float32Array(this.size * this.size);
            this.fdata.fill(1.0, 0, this.fdata.length);

            this.projscale = this.profile.modulus * 2.0;
            this._unprojxy_tmp = util.cachering.fromConstructor(Vector2, 64);
            this._projxy_tmp = util.cachering.fromConstructor(Vector2, 64);
        }

        extractCurve() {
            return 1;
        }

        unproject(ix, iy) {
            let ret = this._unprojxy_tmp.next().zero();

            let size = this.size, radius = this.radius, projscale = this.projscale;

            ret[0] = ix / size - 0.5;
            ret[1] = (size - iy) / size - 0.5;

            ret.mulScalar(projscale);
            ret[1] += radius;

            return ret;
        }

        project(x, y) {
            let p = this._projxy_tmp.next();
            let size = this.size, radius = this.radius, projscale = this.projscale;

            p[0] = x, p[1] = y;

            p[1] -= radius;
            p.divScalar(projscale);

            p[0] = (p[0] + 0.5) * size;
            p[1] = size * (0.5 - p[1]);

            return p;
        }

        draw(canvas, g, drawImage, drawGrid) {
            if (drawImage) {
                let canvas2 = document.createElement("canvas");
                canvas2.width = this.image.width;
                canvas2.height = this.image.height;

                let g2 = canvas2.getContext("2d");
                g2.putImageData(this.image, 0, 0);

                let x = 0, y = 0;
                let w = this.image.width, h = this.image.height;

                this.profile.genRadius();

                y += this.profile.radius;

                /* window.GRAPHICAL_TEST_MODE modification, GRAPHICAL_TEST_SCALE + GRAPHICAL_TEST_OFFSET */
                let scale = GRAPHICAL_TEST_SCALE * this.projscale / this.size;

                //w /= scale;
                //h /= scale;

                //x += window.GRAPHICAL_TEST_OFFSET;
                //y += window.GRAPHICAL_TEST_OFFSET;
                let t = window.T;

                let steps = this.profile.numteeth;
                let dth = (Math.PI * 2) / (steps);
                //dth = 0;

                g.save();

                g.translate(window.GRAPHICAL_TEST_OFFSET, window.GRAPHICAL_TEST_OFFSET);
                g.translate(0, this.profile.radius * GRAPHICAL_TEST_SCALE - this.size * scale * 0.5);

                //g.rotate(dth);
                g.translate(-w * scale * 0.5, 0.0);

                g.scale(scale, scale);

                if (1) {
                    let offx = w / 2, offy = h / 2;
                    g.translate(offx, offy);
                    g.rotate(Math.PI)
                    g.translate(-offx, -offy);
                }

                let x2 = Math.cos(dth) * x + Math.sin(dth) * y;
                let y2 = Math.cos(dth) * y - Math.sin(dth) * x;

                //x = x2;
                //y = y2;


                g.imageSmoothingEnabled = false;
                g.drawImage(canvas2, 0, 0);
                g.restore();
            } else {
                g.putImageData(this.image, 0, 0);
            }
        }

        rotateCanvas(g, th, offsetX) {
            /* window.GRAPHICAL_TEST_MODE modification, GRAPHICAL_TEST_SCALE + GRAPHICAL_TEST_OFFSET */
            let scale = GRAPHICAL_TEST_SCALE;

            let r = this.profile.pitch_radius * scale * 2.0;
            let off = -GRAPHICAL_TEST_OFFSET;

            let offx = off, offy = off;

            g.translate(r * offsetX, 0.0);

            g.translate(-offx, -offy);
            g.rotate(th);
            g.translate(offx, offy);

        }

        makeField() {
            let traps = [];

            let backlash = this.profile.backlash
            let width = this.profile.modulus; //teeth width
            let depth = this.profile.depth

            let numteeth = this.profile.numteeth;
            let pressureth = this.profile.pressureth;

            let radius = this.radius = this.profile.radius;
            let inner_gear = this.profile.inner_gear_mode;

            function trap() { //trap is short for trapezoid
                let width2 = width * 0.5;
                let depth2 = depth * 0.5;

                if (0) {
                    let t2 = [
                        new Vector2([-width2, 0]),
                        new Vector2([-width2, 0]),
                        new Vector2([width2, 0]),
                        new Vector2([width2, 0]),
                    ]

                    let th = pressureth;
                    let vec = new Vector2([Math.sin(th), Math.cos(th)]);

                    //vec[0] = 0.0;
                    //vec[1] = 1.0;

                    vec.mulScalar(depth*Math.cos(th));
                    vec.negate();

                    t2[0].sub(vec);
                    t2[1].add(vec);

                    vec[0] = -vec[0];

                    t2[2].add(vec);
                    t2[3].sub(vec);
                    
                    for (let v of t2) {
                        //v[1] -= depth*0.25;
                        v.mulScalar(0.5);
                    }

                    traps.push(t2);
                    return t2;
                }

                let tanfac = Math.tan(pressureth) * depth;

                let a = 0.5, b = 1.0 - a;
                let y = 0;

                let t = [
                    new Vector2([-width2 + a * tanfac, y - depth2]),
                    new Vector2([-width2 - b * tanfac, y + depth2]),
                    new Vector2([width2 + b * tanfac, y + depth2]),
                    new Vector2([width2 - a * tanfac, y - depth2])
                ];

                traps.push(t);

                return t;
            }

            function rot(t, th) {
                for (let v of t) {
                    v.rot2d(th);
                }
            }

            function trans(t, offx, offy) {
                for (let v of t) {
                    v[0] += offx;
                    v[1] += offy;
                }
            }

            function scale(t, sx, sy) {
                sy = sy === undefined ? sx : sy;

                for (let v of t) {
                    v[0] *= sx;
                    v[1] *= sy;
                }
            }

            let dwidth = width*3.0;
            let dvel = dwidth * 2.0;
            let dth = dvel / radius;

            let rackx = -dvel;

            let steps = 64;
            let dth2 = dth / (steps - 1);
            let dvel2 = dvel / (steps - 1);
            let th = (dwidth) / radius;

            const r = radius + depth * 0.5;

            if (window.GRAPHICAL_TEST_MODE) {
                console.log("pitch:", radius);
            }

            let d = ~~(Math.fract(window.T*0.2)*(steps-1));

            for (let i = 0; i < steps; i++, rackx += dvel2, th -= dth2) {
                if (window.SHOW_CURRENT_TRAP && i !== d) {
                    continue;
                }

                let dx = rackx, dy = radius;

                dx = (rackx) % (dwidth * 2) + dwidth;
                let t = trap();

                trans(t, -dx, dy);
                rot(t, th);
            }

            /*
            on factor;
            off period;
            */
            let itmp1 = new Vector2(), itmp2 = new Vector2(), itmp3 = new Vector2();

            function cutout(x, y) {
                let cutradius = width * 0.333
                let rx = 0, ry = radius - depth * 0.333;

                x -= rx, y -= ry;
                y *= 1.25; //squish cutout a bit

                let d = x * x + y * y;

                if (d == 0) {
                    return 0;
                }

                d = Math.sqrt(d);

                return cutradius - d;
            }

            let itmp = new Vector2();
            function inside(x, y) {
                let minret = undefined;

                if (inner_gear) {
                    let r2 = Math.sqrt(x * x + y * y);

                    r2 -= radius;// - depth*0.5;
                    //r2 = depth - r2;
                    r2 = -r2;
                    r2 += radius;// - depth*0.5;

                    itmp[0] = x, itmp[1] = y;
                    itmp.normalize().mulScalar(r2);

                    x = itmp[0], y = itmp[1];
                }

                if (x * x + y * y > r * r) {
                    return 1;
                }

                for (let t of traps) {
                    let sum = undefined;

                    let ok = true;

                    for (let i = 0; i < 4; i++) {
                        let a = t[i], b = t[(i + 1) % t.length];

                        let v1 = itmp1.zero();
                        let v2 = itmp2.zero();

                        v1.load(b).sub(a).normalize();

                        v2[0] = x;
                        v2[1] = y;

                        v2.sub(a);

                        let c = v1[1] * v2[0] - v1[0] * v2[1];

                        if (c < 0) {
                            //ok = false;
                            //break;
                        }

                        if (sum === undefined || c < sum) {
                            sum = c;
                        }
                    }

                    //sum += 0.5*backlash

                    if (ok && sum !== undefined) {
                        minret = minret === undefined ? sum : Math.max(sum, minret);
                    }
                }

                /* depth cutout
                let f = cutout(x, y);
                if (minret === undefined || f > minret) {
                    minret = f;
                }
                //*/

                return minret === undefined ? 1.0 : (3 * minret / width) + 0 * backlash;
            }

            let size = this.size;
            let data = this.image.data, fdata = this.fdata;
            let xscale = width * 4;
            let yscale = width * 4;

            for (let i = 0; i < size; i++) {
                for (let j = 0; j < size; j++) {
                    let p = this.unproject(i, j);

                    let df = 0.05;

                    let c = inside(p[0], p[1]);
                    fdata[j * size + i] = c;

                    c = Math.abs(c);

                    c = ~~(c * 255);
                    let idx = (j * size + i) * 4;

                    data[idx] = c;
                    data[idx + 1] = c;
                    data[idx + 2] = c;
                    data[idx + 3] = 255;
                }
            }
        }

        //factor is optional, 1.0
        smooth(mesh, factor) {
            factor = factor === undefined ? 1.0 : factor;

            let cos = []
            let i = 0;

            for (let v of mesh.verts) {
                cos.push(new Vector3(v));
                v.index = i;

                i++;
            }

            let tmp = new Vector3();

            for (let v of mesh.verts) {
                if (v.edges.length != 2) {
                    continue;
                }

                let tot = 0;
                v.zero();

                for (let e of v.edges) {
                    let v2 = e.otherVertex(v);

                    tot++;
                    v.add(cos[v2.index]);
                }

                v.divScalar(tot);

                tmp.load(cos[v.index]).interp(v, factor);
                v.load(tmp);
            }
        }

        run(state) {
            let newmesh = this.mesh = new mesh.Mesh();

            if (state) {
                state.mesh = newmesh;
            }

            this.profile.genRadius();

            let width = this.profile.modulus; //teeth width
            let depth = this.profile.depth

            let numteeth = this.profile.numteeth;
            let pressureth = this.profile.pressureth;
            let size = this.size;

            let radius = this.radius = this.profile.radius;

            this.makeField();
            this.implicit2lines();

            if (0) {
                for (let v of newmesh.verts) {
                    if (window.GRAPHICAL_TEST_MODE) {
                        v.mulScalar(GRAPHICAL_TEST_SCALE).addScalar(window.GRAPHICAL_TEST_OFFSET);
                    }
                    v[2] = 0;
                }
                return;
            }

            for (let i = 0; i < 5; i++) {
                this.smooth(newmesh);
            }

            function collapse() {
                let vec1 = new Vector2();
                let vec2 = new Vector2();
                let tmp = new Vector2();
                let dellist = []

                for (let v of newmesh.verts) {
                    if (v.edges.length != 2) {
                        continue;
                    }

                    let v1 = v.edges[0].otherVertex(v);
                    let v2 = v;
                    let v3 = v.edges[1].otherVertex(v);

                    //find distance of v2 to edge between v1 and v3
                    let v4 = tmp.load(v1).add(v2).mulScalar(0.5);

                    vec1.load(v2).sub(v1).normalize();
                    vec2.load(v3).sub(v2).normalize();

                    let err = v2.vectorDistance(v4); //vec1.dot(vec2);
                    let th = Math.acos(vec1.dot(vec2));

                    //take angle into account too
                    err *= (1.0 + th * 2.0) ** 4;

                    //collapse, if small enough
                    if (Math.abs(err) < 0.06) {
                        dellist.push(v);
                        newmesh.makeEdge(v1, v3);
                    }
                }

                for (let v of dellist) {
                    newmesh.killVertex(v);
                }
            }

            for (let i = 0; i < 10; i++) {
                collapse();
            }

            console.warn("TOTVERTS:", newmesh.verts.length);

            let this2 = this;
            function mirror() {
                //tag original geometry
                for (let v of newmesh.verts) {
                    v.tag = 1;
                }

                //*
                //mirror
                let vmap = {}
                let connectv = undefined;
                for (let v of newmesh.verts) {
                    if (v.edges.length == 1) {
                        if (connectv === undefined || Math.abs(v[0]) < Math.abs(connectv[0])) {
                            connectv = v;
                        }
                    }
                }

                for (let v of newmesh.verts) {
                    if (v.tag != 1) {
                        continue;
                    }

                    let v2 = newmesh.makeVertex(v);
                    vmap[v.eid] = v2;

                    v2[0] = -v2[0];
                    v2.tag = 2;

                    if (v === connectv) {
                        newmesh.makeEdge(v, v2);
                    }
                }

                //mirror over edges
                for (let e of newmesh.edges) {
                    e.tag = 1;

                    let v1 = vmap[e.v1.eid];
                    let v2 = vmap[e.v2.eid];

                    if (v1 === undefined || v2 === undefined) {
                        //this should only happen once, because of the "if (v === connectv)" block above to bridge the two sides
                        continue;
                    }

                    newmesh.makeEdge(v1, v2);
                }
                //*/

                //now, sort profile

                //find the end that's an original vertex
                let startv = undefined;

                for (let v of newmesh.verts) {
                    if (v.tag == 1 && v.edges.length == 1) {
                        startv = v;
                        break;
                    }
                }

                //walk
                let v = startv, e = v.edges[0];
                let _i = 0; //infinite loop guard
                let sortlist = this2.sortlist = [];

                while (1) {
                    sortlist.push(v);

                    v = e.otherVertex(v);

                    if (v.edges.length == 1) {
                        sortlist.push(v);
                        break;
                    } else {
                        e = v.otherEdge(e);
                    }

                    if (_i++ > 100000) {
                        console.log("Infinite loop detected!");
                        break;
                    }
                }

                //re-tag mirrored geometry as original
                for (let v of newmesh.verts) {
                    v.tag = 1;
                }

                return sortlist;
            }

            let sortlist = mirror();
            //*/

            this.applyBacklash(newmesh, sortlist);

            //*
            let steps = this.profile.numteeth;
            let dth = (Math.PI * 2) / (steps), th = 0;
            let lastv = undefined;
            let firstv = undefined;

            for (let i = 0; i < steps; i++) {
                for (let v of sortlist) {
                    let v2 = newmesh.makeVertex(v);

                    let x = v2[0], y = v2[1];

                    v2[0] = Math.cos(th) * x + Math.sin(th) * y;
                    v2[1] = Math.cos(th) * y - Math.sin(th) * x;
                    v2.tag = 2;

                    if (lastv !== undefined) {
                        newmesh.makeEdge(lastv, v2);
                    } else {
                        firstv = v2;
                    }

                    lastv = v2;
                }

                th += dth;
            }

            //destroy original template
            for (let v of sortlist) {
                newmesh.killVertex(v);
            }
            newmesh.makeEdge(firstv, lastv)
            //*/

            for (let v of newmesh.verts) {
                if (window.GRAPHICAL_TEST_MODE) {
                    v.mulScalar(GRAPHICAL_TEST_SCALE).addScalar(window.GRAPHICAL_TEST_OFFSET);
                }
                v[2] = 0;
            }
            /*
            let x = 0, y = radius-depth/2;
            let p = project(x, y);
            let ix = ~~p[0], iy = ~~p[1];
            
            console.log(ix, iy, x, y);
            
            let circ = util.searchoff(12);
            for (let off of circ) {
                let ix2 = off[0] + ix;
                let iy2 = off[1] + iy;
                
                if (ix2 < 0 || iy2 < 0 || ix2 >= size || iy2 >= size) {
                    continue;
                }
                
                let idx = (iy2*size + ix2)*4;
                
                data[idx] = 255;
                data[idx+1] = 0;
                data[idx+2] = 0;
                data[idx+3] = 255;
            }
            //*/

            this.smooth(newmesh, 0.5);

            if (window.redraw_all) {
                window.redraw_all();
            }
        }

        checkMesh(mesh, sortlist) {
            if (sortlist.length == 0) {
                return;
            }

            outer:
            for (let e1 of mesh.edges) {
                for (let e2 of mesh.edges) {
                    let skip = e1 == e2;

                    skip = skip || e1.v1 === e2.v1 || e1.v2 === e2.v2;
                    skip = skip || e1.v1 === e2.v2 || e1.v2 === e2.v1;

                    if (skip) {
                        continue;
                    }

                    if (math.line_line_cross(e1.v1, e1.v2, e2.v1, e2.v2)) {
                        if (window.GRAPHICAL_TEST_MODE) {
                            console.log("isect");
                        }

                        //find "ear" loop to cut off
                        //note that we'll add a new vertex at the intersection
                        let vlist = [], elist = [];
                        let prevv = undefined, nextv = undefined;
                        let ok = false;

                        //there are two directions to search in, have to try both
                        for (let i = 0; i < 2; i++) {
                            vlist.length = 0;
                            elist.length = 0;

                            let v = i ? e1.v2 : e1.v1, e = e1;
                            let _i = 0;

                            vlist.push(v);
                            elist.push(e);

                            while (1) {
                                v = e.otherVertex(v);
                                vlist.push(v);

                                if (v === e2.v1 || v === e2.v2) {
                                    ok = true;
                                    break;
                                }

                                if (v.edges.length != 2) {
                                    break;
                                }

                                e = v.otherEdge(e);
                                elist.push(e);

                                if (_i++ > 100000) {
                                    console.warn("Infinite loop error");
                                    break;
                                }
                            }

                            if (ok) {
                                break;
                            }
                        }

                        if (!ok) {
                            vlist.length = elist.length = 0;
                        } else {
                            let getadj = (v, e) => {
                                if (v.edges.length != 2) {
                                    return undefined;
                                }

                                e = v.otherEdge(e);
                                return e.otherVertex(v);
                            }

                            prevv = getadj(vlist[0], elist[0]);
                            nextv = getadj(vlist[vlist.length - 1], elist[elist.length - 1]);
                        }

                        if (prevv === undefined || nextv === undefined) {
                            continue;
                        }

                        let isect = math.line_line_isect(e1.v1, e1.v2, e2.v1, e2.v2);

                        let nv = mesh.makeVertex(isect);

                        let v1 = e1.v1, v2 = e1.v2, v3 = e2.v1, v4 = e2.v2;

                        for (let v of vlist) {
                            mesh.killVertex(v);
                        }

                        mesh.makeEdge(prevv, nv);
                        mesh.makeEdge(nv, nextv);
                        continue outer;
                    }
                }
            }

            this.genSortList(mesh, sortlist[0], sortlist);
        }

        //sortlist is optional, array to reuse
        genSortList(mesh, startv1, sortlist) {
            sortlist = sortlist === undefined ? [] : sortlist;

            let v1 = startv1;
            let e1 = v1.edges[0];
            let _i = 0;

            sortlist.length = 0;
            while (1) {
                sortlist.push(v1);

                v1 = e1.otherVertex(v1);

                if (v1.edges.length != 2) {
                    break;
                }

                e1 = v1.otherEdge(e1);

                if (_i++ > 100000) {
                    console.warn("infinite loop detected");
                    break;
                }
            }

            sortlist.push(v1);

            return sortlist;
        }

        applyBacklash(mesh, sortlist) {
            let norm = new Vector2();
            let tmp1 = new Vector2(), tmp2 = new Vector2();

            if (sortlist.length < 2) {
                return;
            }

            let newcos = []
            let sign = this.profile.inner_gear_mode ? -1 : 1;

            let steps = 1;
            let dist = this.profile.backlash / steps;

            for (let si = 0; si < steps; si++) {
                for (let i = 0; i < sortlist.length; i++) {
                    let v = sortlist[i];

                    if (i == 0) {
                        norm.load(sortlist[1]).sub(v).normalize();
                    } else if (i == sortlist.length - 1 && v.edges.length == 1) {
                        norm.load(v).sub(sortlist[i - 1]).normalize();
                    } else {
                        let v2 = sortlist[(i - 1)];
                        let v3 = sortlist[(i + 1) % sortlist.length];

                        tmp1.load(v).sub(v2);
                        tmp2.load(v3).sub(v);

                        norm.load(tmp1).add(tmp2).normalize();
                    }

                    let t = norm[0]; norm[0] = norm[1]; norm[1] = -t;

                    norm.mulScalar(sign * dist);

                    newcos.push(new Vector2(v).add(norm));
                }

                for (let i = 0; i < sortlist.length; i++) {
                    sortlist[i].load(newcos[i]);
                }

                this.smooth(mesh, 0.5);
                this.checkMesh(mesh, sortlist);

                newcos.length = 0;
            }
        }

        implicit2lines() {
            let width = this.profile.modulus; //teeth width
            let depth = this.profile.depth
            let radius = this.radius, fdata = this.fdata, size = this.size;
            let numteeth = this.profile.numteeth;
            let newmesh = this.mesh;

            let offs = [
                [0, 1],
                [1, 1],
                [1, 0]
                /*
                  [-1, -1],
                  [0, -1],
                  [1, -1], 
                  
                  [1, 0],
                  [1, 1],
                  [0, 1],
                  
                  [-1, 1]
                  [-1, 0]
                  */
            ];

            let mids = [
                [[0, 0.5], [0.5, 1]], //1
                [[0.5, 1], [1, 0.5]], //2
                [[1, 0.5], [0.5, 0]], //4
                [[0.5, 0], [0, 0.5]], //8
                [[0, 0.5], [1, 0.5]], //16
                [[0.5, 0], [0.5, 1]], //32
                [[0, 0], [1, 1]],     //64
                [[0, 0.5], [0.5, 0]]  //128
            ];

            let masktable = [
                0,
                1,
                2,
                16,
                4,
                64,
                32,
                128
            ];

            let v1 = new Vector2(), v2 = new Vector2();
            let vhash = {};

            function getvert(co) {
                let x = co[0].toFixed(5);
                let y = co[1].toFixed(5);

                let hash = x + "," + y;

                if (hash in vhash) {
                    return vhash[hash];
                } else {
                    vhash[hash] = newmesh.makeVertex(co);
                    return vhash[hash];
                }
            }

            for (let ix = 2; ix < size / 2; ix++) {
                for (let iy = 2; iy < size - 2; iy++) {
                    let s = fdata[iy * size + ix];

                    let table = []
                    let mask = 0;

                    for (let i = 0; i < offs.length; i++) {
                        let ix2 = ix + offs[i][0], iy2 = iy + offs[i][1];
                        let s2 = fdata[iy2 * size + ix2];

                        if (s == 0 || s2 == 0) {
                            continue;
                        }

                        if ((s > 0.0) != (s2 > 0.0)) {
                            mask |= 1 << i;
                        }
                    }

                    let lines = masktable[mask];

                    if (lines === undefined) {
                        throw new Error("eek");
                    }

                    for (let i = 0; i < mids.length; i++) {
                        let l = mids[i];

                        if (lines & (1 << i)) {
                            let x1 = ix + l[0][0], y1 = iy + l[0][1];
                            let x2 = ix + l[1][0], y2 = iy + l[1][1];

                            v1[0] = x1, v1[1] = y1;
                            v2[0] = x2, v2[1] = y2;

                            v1.load(this.unproject(v1[0], v1[1]));
                            v2.load(this.unproject(v2[0], v2[1]));

                            let mv1 = getvert(v1);
                            let mv2 = getvert(v2);
                            newmesh.makeEdge(mv1, mv2);
                        }
                    }
                }
            }
        }

    };

    return exports;
});
