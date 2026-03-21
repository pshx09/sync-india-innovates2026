const axios = require('axios');

/**
 * Service to interact with Mappls Maps APIs
 */

class MapplsService {
    /**
     * Get safe route bypassing multiple PostGIS hazard geometries
     * @param {number} startLat 
     * @param {number} startLng 
     * @param {number} endLat 
     * @param {number} endLng 
     * @param {Array} hazardsArray - Array of hazards with {lat, lng} from PostGIS
     * @returns {Object} Route data including polyline
     */
    static async getSafeRoute(startLat, startLng, endLat, endLng, hazardsArray = []) {
        try {
            if (!process.env.MAPPLS_API_KEY) {
                throw new Error("MAPPLS_API_KEY is not configured in environment variables.");
            }

            const origin = `${startLng},${startLat}`;
            const destination = `${endLng},${endLat}`;
            
            let url = `https://apis.mappls.com/advancedmaps/v1/${process.env.MAPPLS_API_KEY}/route_adv/driving/${origin};${destination}`;
            
            let avoidParam = '';
            if (hazardsArray && hazardsArray.length > 0) {
                // Build semicolon-separated bbox strings for Mappls
                // Mappls uses avoid=bbox:minLng,minLat,maxLng,maxLat;bbox:...
                const bboxes = hazardsArray.map(h => {
                    const lat = parseFloat(h.lat);
                    const lng = parseFloat(h.lng);
                    if (isNaN(lat) || isNaN(lng)) return null;
                    // ~100m bounding box (0.0009 deg)
                    const minLat = lat - 0.0009;
                    const maxLat = lat + 0.0009;
                    const minLng = lng - 0.0009;
                    const maxLng = lng + 0.0009;
                    return `bbox:${minLng},${minLat},${maxLng},${maxLat}`;
                }).filter(Boolean);

                if (bboxes.length > 0) {
                    avoidParam = bboxes.join(';');
                }
            }

            const params = {
                alternatives: true,
                steps: true,
                geometries: 'geojson'
            };

            if (avoidParam) {
                params.exclude = avoidParam; // 'exclude' or 'avoid' depending on Mappls flavor. Mappls officially recommends 'exclude' in v1 docs for bounding boxes.
            }

            console.log(`[MapplsService] Requesting route avoiding: ${avoidParam || 'none'}`);
            
            const response = await axios.get(url, { params });
            
            if (response.data && response.data.routes && response.data.routes.length > 0) {
                return response.data.routes[0];
            } else {
                throw new Error("No route found from Mappls API.");
            }
        } catch (error) {
            console.error("[MapplsService] Error fetching alternative route:", error.message);
            if (error.response) console.error("[MapplsService] Error detail:", error.response.data);
            throw new Error(`Failed to get route: ${error.message}`);
        }
    }
}

module.exports = MapplsService;
