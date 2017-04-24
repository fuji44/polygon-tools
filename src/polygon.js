/**
 * @module polygon
 */
import * as tess from './tesselator';
import * as vec from './vec';

export const WINDING_UNKNOWN = 0;
export const WINDING_CCW = 1;
export const WINDING_CW = 2;

export function ccw (a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
}

/**
 * Polygon normal (2d / 3d)
 *
 * @param {Array} pts
 *
 * @return {Array} Polygon normal or null if the polygon is degenerate
 */
export function normal (pts) {

  if (pts.length < 3) return null;

  let vs = pts.map(p => {
        return p.length === 3 ? p : [p[0], p[1], 0];
      }),
      [a, b, c] = vs,
      ba = vec.subtract(b, a),
      ca = vec.subtract(c, a),
      cr = vec.normalize(vec.cross(ba, ca));

  if (cr.some(v => isNaN(v))) {
    if (pts.length === 3) return null;
  } else {
    return cr;
  }

  // fallback to Newell's method
  let n = [0, 0, 0];
  vs.forEach((v, i) => {
    let w = vs[(i+1) % pts.length];
    n[0] = n[0] + (v[1] - w[1]) * (v[2] + w[2]);
    n[1] = n[1] + (v[2] - w[2]) * (v[0] + w[0]);
    n[2] = n[2] + (v[0] - w[0]) * (v[1] + w[1]);
  });

  n = vec.normalize(n);

  return n.some(v => isNaN(n)) ? null : n;
}

/**
 * Signed area of a polygon (2d)
 *
 * @param {Array} pts
 *
 * @return {Number}
 */
export function area (pts) {
  return pts.reduce((a, p, i) => {
    let pn = pts[i+1] || pts[0];
    return a + p[0] * pn[1] - pn[0] * p[1];
  }, 0) / 2;
}

/**
 * Polygon centroid (2d)
 *
 * @param {Array} pts
 *
 * @return {Array}
 */
export function centroid (pts) {
  let [x, y] = pts.reduce(([x,y], p, i) => {
      let pn = pts[i+1] || pts[0],
          c = p[0] * pn[1] - pn[0] * p[1];
      return [x + (p[0] + pn[0]) * c, y + (p[1] + pn[1]) * c];
  }, [0, 0]);

  let ar = area(pts);
  if (x !== 0) {
      x = x / (Math.abs(ar) * 6);
  }
  if (y !== 0 ) {
      y = y / (Math.abs(ar) * 6);
  }

  if (ar < 0) {
      x = -x;
      y = -y;
  }
  return [x, y];
}

/**
 * Tests wether the polygon winding is counter clockwise
 *
 * @param {Array} pts
 *
 * @return {Boolean}
 */
export function is_ccw (pts) {
  return area(pts) > 0;
}

/**
 * Tests wether the polygon winding is clockwise
 *
 * @param {Array} pts
 *
 * @return {Boolean}
 */
export function is_cw (pts) {
  return area(pts) < 0;
}

/**
 * Polygon winding
 *
 * @param {Array} pts
 *
 * @return {Number}
 */
export function winding (pts) {
  let a = area(pts);
  if (a < 0) return WINDING_CW;
  if (a > 0) return WINDING_CCW;
  return WINDING_UNKNOWN;
}

/**
 * Polygon bounds.
 * @typedef {Object} PolygonBounds
 * @property {Number} xMin
 * @property {Number} yMin
 * @property {Number} xMax
 * @property {Number} yMax
 */

/**
 * Polygon bounds
 *
 * @param {Array} pts
 *
 * @return {PolygonBounds}
 */
export function bounds (pts) {
  let min = [ Number.MAX_VALUE,  Number.MAX_VALUE],
      max = [-Number.MAX_VALUE, -Number.MAX_VALUE];

  pts.forEach(p => {
    for (let i = 0; i < p.length; ++i) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
  });

  return {
    xMin: min[0],
    yMin: min[1],
    xMax: max[0],
    yMax: max[1]
  };
}

/**
 * Ensures CW winding
 *
 * @param {Array} pts
 *
 * @return {Array}
 */
export function ensure_cw (pts) {
  if (is_ccw(pts)) pts.reverse();
  return pts;
}

/**
 * Ensures CCW winding
 *
 * @param {Array} pts
 *
 * @return {Array}
 */
export function ensure_ccw (pts) {
  if (is_cw(pts)) pts.reverse();
  return pts;
}

/**
 * Helper for triangulate
 * @private
 */
function to_triangles (data) {
  let result = [];
  for (let i = 0; i < data.length; i += 3) {
    result.push([data[i], data[i+1], data[i+2]]);
  }
  return result;
}

/**
 * Triangulates a polygon
 *
 * @param {Array} polygon
 * @param {Array.<Array>} holes
 *
 * @return triangles
 */
export function triangulate (polygon, holes) {
  if (!polygon || polygon.length < 3 || !holes || holes.length < 1)
    return polygon;

  let bp = bounds(polygon);

  holes = holes.filter(hole => {
    let b = bounds(hole),
        out = b.xMin > bp.xMax ||
              b.yMin > bp.yMax ||
              b.xMax < bp.xMin ||
              b.yMax < bp.yMin;
    return !out;
  });

  if (holes.length === 0) return polygon;

  let options = {polygons: [polygon], holes: holes};

  return tess.run(options)
    .map(to_triangles)
    .reduce((p, v) => {
      return p.concat(v);
    }, []);
}

/**
 * Subtract polygons
 *
 * @param {Array} polygons
 *
 * @return {Array}
 */
export function subtract (...polygons) {
  let options = {
        polygons: [ensure_ccw(polygons[0])],
        holes: polygons.slice(1).map(p => ensure_cw(p)),
        boundaryOnly: true,
        autoWinding: false
      };
  return tess.run(options);
}

/**
 * Union of a set of polygons
 *
 * @param {Array} polygons
 *
 * @return {Array}
 */
export function union (...polygons) {
  let options = {
        polygons: polygons.map(p => ensure_ccw(p)),
        boundaryOnly: true,
        autoWinding: false
      };
  return tess.run(options);
}

/**
 * Intersection of a set of polygons
 *
 * @param {Array} a First polygon
 * @param {Array} b Second polygon
 *
 * @return {Array}
 */
export function intersection (a, b) {
  let options = {
        polygons: [ensure_ccw(a), ensure_ccw(b)],
        boundaryOnly: true,
        windingRule: tess.GLU_TESS_WINDING_ABS_GEQ_TWO,
        autoWinding: false
      };
  return tess.run(options);
}
