type NominatimAddress = Record<string, string>;
type PlaceGeometry =
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] };

export type NominatimPlace = {
    display_name: string;
    name?: string;
    category?: string;
    type?: string;
    address?: NominatimAddress;
    geojson?: PlaceGeometry;
    boundingbox?: [string, string, string, string];
};
export type PlaceBounds = {
    south: number;
    north: number;
    west: number;
    east: number;
};

const REVERSE_CACHE_LIMIT = 500;
const reverseCache = new Map<string, string>();
let requestQueue = Promise.resolve();
let lastRequestAt = 0;

async function nominatimRequest<T>(url: string): Promise<T> {
    const request = requestQueue.then(async () => {
        const delay = Math.max(0, 1100 - (Date.now() - lastRequestAt));
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        lastRequestAt = Date.now();
        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
                "User-Agent": "RickshawFleetAssistant/1.0",
            },
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error(`Nominatim request failed (${response.status})`);
        return response.json() as Promise<T>;
    });
    requestQueue = request.then(() => undefined, () => undefined);
    return request;
}

export function getBangladeshAreaName(address?: NominatimAddress) {
    if (!address) return "";
    const parts = [
        address.neighbourhood,
        address.suburb,
        address.city_district,
        address.city ?? address.town ?? address.village,
        address.county,
        address.state,
    ].filter((part, index, values) => Boolean(part) && values.indexOf(part) === index);
    return parts.slice(0, 3).join(", ");
}

export async function reverseGeocodeBangladesh(latitude: number, longitude: number) {
    const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const cached = reverseCache.get(key);
    if (cached) return cached;

    const params = new URLSearchParams({
        format: "jsonv2",
        lat: String(latitude),
        lon: String(longitude),
        zoom: "16",
        addressdetails: "1",
    });
    const result = await nominatimRequest<{ address?: NominatimAddress }>(
        `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
    );
    const areaName = getBangladeshAreaName(result.address);
    if (areaName) {
        if (reverseCache.size >= REVERSE_CACHE_LIMIT) {
            const oldest = reverseCache.keys().next().value;
            if (oldest) reverseCache.delete(oldest);
        }
        reverseCache.set(key, areaName);
    }
    return areaName;
}

export async function searchBangladeshPlace(query: string) {
    const params = new URLSearchParams({
        q: `${query}, Bangladesh`,
        format: "jsonv2",
        addressdetails: "1",
        countrycodes: "bd",
        limit: "10",
        polygon_geojson: "1",
        viewbox: "88,26.7,92.7,20.5",
        bounded: "1",
    });
    const results = await nominatimRequest<NominatimPlace[]>(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    );
    if (!results.length) return null;
    const queryText = query.toLowerCase();
    const score = (place: NominatimPlace) => {
        const type = place.type?.toLowerCase();
        const category = place.category?.toLowerCase();
        const name = `${place.name ?? ""} ${place.display_name}`.toLowerCase();
        const isArea = ["suburb", "neighbourhood", "quarter", "city_district", "district", "administrative"].includes(type ?? "");
        const isSettlement = ["city", "town", "village", "municipality"].includes(type ?? "");
        return (name.includes(queryText) ? 10 : 0) +
            (category === "place" ? 30 : 0) +
            (isArea ? 100 : 0) +
            (isSettlement ? 90 : 0) +
            (place.geojson?.type === "Polygon" || place.geojson?.type === "MultiPolygon" ? 10 : 0);
    };
    return results.reduce((best, candidate) => score(candidate) > score(best) ? candidate : best);
}

function isPointInRing(point: [number, number], ring: number[][]) {
    const [longitude, latitude] = point;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const current = ring[i];
        const previous = ring[j];
        if (!current || !previous) continue;
        const [xi, yi] = current;
        const [xj, yj] = previous;
        if (xi === undefined || yi === undefined || xj === undefined || yj === undefined) continue;
        const crosses = (yi > latitude) !== (yj > latitude) &&
            longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi;
        if (crosses) inside = !inside;
    }
    return inside;
}

function isPointInPolygon(point: [number, number], polygon: number[][][]) {
    const outerRing = polygon[0];
    if (!outerRing || !isPointInRing(point, outerRing)) return false;
    return !polygon.slice(1).some((hole) => isPointInRing(point, hole));
}

export function isPointInsidePlace(
    latitude: number,
    longitude: number,
    place: NominatimPlace,
) {
    const point: [number, number] = [longitude, latitude];
    if (place.geojson?.type === "Polygon") {
        return isPointInPolygon(point, place.geojson.coordinates);
    }
    if (place.geojson?.type === "MultiPolygon") {
        return place.geojson.coordinates.some((polygon) => isPointInPolygon(point, polygon));
    }
    if (place.boundingbox) {
        const [southValue, northValue, westValue, eastValue] = place.boundingbox;
        const south = Number(southValue);
        const north = Number(northValue);
        const west = Number(westValue);
        const east = Number(eastValue);
        if (![south, north, west, east].every(Number.isFinite)) return false;
        return latitude >= south && latitude <= north && longitude >= west && longitude <= east;
    }
    return false;
}

export function getPlaceBounds(place: NominatimPlace): PlaceBounds | null {
    if (place.boundingbox) {
        const [southValue, northValue, westValue, eastValue] = place.boundingbox;
        const south = Number(southValue);
        const north = Number(northValue);
        const west = Number(westValue);
        const east = Number(eastValue);
        if ([south, north, west, east].every(Number.isFinite)) {
            return { south, north, west, east };
        }
    }

    const polygons = place.geojson?.type === "Polygon"
        ? [place.geojson.coordinates]
        : place.geojson?.type === "MultiPolygon"
            ? place.geojson.coordinates
            : [];
    const points = polygons.flat(2);
    if (!points.length) return null;
    const longitudes = points.map((point) => point[0]).filter((value): value is number => value !== undefined);
    const latitudes = points.map((point) => point[1]).filter((value): value is number => value !== undefined);
    if (!longitudes.length || !latitudes.length) return null;
    return {
        south: Math.min(...latitudes),
        north: Math.max(...latitudes),
        west: Math.min(...longitudes),
        east: Math.max(...longitudes),
    };
}
