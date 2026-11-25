# Tripsolver · AI Itinerary Optimizer

TSP-based travel itinerary optimizer. Finds the **shortest visiting order** for cities
(nearest-neighbour + 2-opt) and layers in **live weather** per city.

## Run
    node server.js
Then open http://localhost:4000

## APIs (100% free, no keys required)
- **Geocoding:** Open-Meteo geocoding API (no key)
- **Weather:** Open-Meteo forecast API (no key)
- **Distances:** Haversine computed locally

## How it works
1. You type a start city + cities to visit + trip length.
2. Server geocodes each city (lat/lon).
3. **TSP solver** (nearest-neighbour, then 2-opt local search) finds the shortest round-trip order.
4. Weather is fetched for each city for the next 3 days.
5. UI renders: route map pills, per-leg km + drive time, weather cards, and a day-by-day plan.

## Upgrade path (add a real road-distance API)
In `server.js`, replace the `haversine()` cost in `solveTSP` with a call to
OpenRouteService `/v2/directions` or Google Distance Matrix for driving distances.
No other code changes needed — the solver is metric-agnostic.

## Structure
    server.js          Node HTTP server (zero deps) + API proxy + TSP solver
    public/index.html  Dark UI (matches the resume aesthetic)