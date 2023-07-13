import { useEffect, useRef, useState, Fragment } from "react";
import mapboxgl, { type GeoJSONSource } from "mapbox-gl";
import { ColorLegend, TimeColorMapper } from "./colors";
import { mvtUrl } from "./dev-api";
import { getDetails } from "./get_data";
import { DetailPopup, type TripDetailsTransit } from "./format-details";
import { startingLocation } from "./app";
import track from "./analytics";

export const defaultColor = "rgb(255,0,0)";

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [],
};

function addMVTLayer(currentMap: mapboxgl.Map) {
    if (currentMap.getLayer("transit-layer")) currentMap.removeLayer("transit-layer");
    if (currentMap.getSource("some id")) currentMap.removeSource("some id");
    currentMap.addSource("some id", {
        type: "vector",
        tiles: [`${mvtUrl}/all_cities/{z}/{x}/{y}.pbf`],
    });

    currentMap.addLayer({
        id: "transit-layer", // Layer ID
        type: "line",
        source: "some id", // ID of the tile source created above
        "source-layer": "all_cities",
        layout: {
            "line-cap": "round",
            "line-join": "round",
        },
        paint: {
            "line-opacity": 0.4,
            // "line-color": defaultColor,
            "line-color": "#8f8f8f",
            "line-width": 3.5,
        },
    });

    currentMap.setPaintProperty("transit-layer", "line-color", [
        "coalesce",
        ["get", ["to-string", ["id"]], ["literal", { 111693: "#00a6ff" }]],
        "#adadad",
    ]);
}

function addGeoJsonLayer(currentMap: mapboxgl.Map): GeoJSONSource {
    currentMap.addSource("geojson-path", {
        type: "geojson",
    });

    currentMap.addLayer({
        id: "geojson-path-layer",
        type: "line",
        source: "geojson-path",
        layout: {
            "line-join": "round",
            "line-cap": "butt",
        },
        paint: {
            "line-color": ["get", "color"],
            "line-width": ["get", "line_width"],
            "line-opacity": 0.6,
        },
    });
    currentMap.addLayer({
        id: "geojson-circle-layer",
        type: "circle",
        source: "geojson-path",
        paint: {
            "circle-color": ["get", "color"],
            "circle-radius": 5.2,
        },
        filter: ["==", "$type", "Point"],
    });

    return currentMap.getSource("geojson-path") as GeoJSONSource;
}

function bufferPoint(point: mapboxgl.Point): [mapboxgl.Point, mapboxgl.Point] {
    const buffer = new mapboxgl.Point(3, 3);
    return [point.sub(buffer), point.add(buffer)];
}

function setupMapboxMap(
    currentMap: mapboxgl.Map,
    setLatLng: (latlng: mapboxgl.LngLat) => void,
    getTimeData: () => TimeColorMapper,
    doneCallback: () => void,
    setDetailPopupInfo: (TripDetailsTransit?, number?) => void
) {
    currentMap.on("load", () => {
        addMVTLayer(currentMap);

        const geojsonSource = addGeoJsonLayer(currentMap);

        const removeHoverDetails = () => {
            currentMap.getCanvas().style.cursor = "";
            geojsonSource.setData(EMPTY_GEOJSON);
            setDetailPopupInfo(null, null);
        };

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                removeHoverDetails();
            }
        })

        currentMap.on("dblclick", (e) => {
            e.preventDefault();
            track("dblclick-map-origin-change", {
                location: e.lngLat.toString(),
            });
            setLatLng(e.lngLat);
        });

        const hoverCallback = (e) => {
            const nearbyFeatures = currentMap.queryRenderedFeatures(bufferPoint(e.point), { layers: ["transit-layer"] });
            if (nearbyFeatures.length === 0) {
                if (e.type === "click") removeHoverDetails();
                return;
            }

            currentMap.getCanvas().style.cursor = "crosshair";
            const feature = nearbyFeatures[0];
            if (!feature.id) return;

            const seconds = getTimeData().raw[feature.id];

            if (!seconds) return;

            getDetails(getTimeData(), e.lngLat)
                .then((detailResponse) => {
                    const details: TripDetailsTransit[] = detailResponse.details;
                    setDetailPopupInfo(details, seconds);

                    const path: GeoJSON.Feature = detailResponse.path;

                    track("hover-get-path", { location: e.lngLat.toString() });
                    if (path) {
                        geojsonSource.setData(path);
                    }
                })
                .catch((e) => {
                    throw e;
                });
        };

        currentMap.on("mouseover", "transit-layer", hoverCallback);
        currentMap.on("click", hoverCallback);
        currentMap.on("mouseleave", "transit-layer", removeHoverDetails);

        doneCallback();
    });
}

export async function setAndColorNewOriginLocation(
    currentLatLng,
    currentOptions,
) {
    console.log(currentOptions, currentLatLng)
    const data = await TimeColorMapper.fetch(
        currentLatLng,
        currentOptions.startTime,
        currentOptions.duration,
        currentOptions.agencies,
        currentOptions.modes,
        currentOptions.minDuration
    );
    //
    // let shouldRetry = false;
    // const errHandler = (err) => {
    //     if (
    //         err.error.message.includes(" does not exist in the map's style and cannot be styled.")
    //     ) {
    //         console.log("Error!! ", err);
    //         shouldRetry = true;
    //     }
    // };
    // map.once("error", errHandler);
    //
    // map.setPaintProperty("transit-layer", "line-color", [
    //     "coalesce",
    //     ["get", ["to-string", ["id"]], ["literal", data.m]],
    //     defaultColor,
    // ]);
    //
    // if (shouldRetry) {
    //     console.log("Retrying...");
    //     addMVTLayer(map);
    //     await new Promise((resolve) => setTimeout(resolve, 2000));
    //     const d1 = await setAndColorNewOriginLocation(
    //         currentLatLng,
    //         currentOptions,
    //         map,
    //         setSpinnerLoading
    //     );
    //     return d1;
    // }
    //
    // map.off("error", errHandler);
    //
    // map.once("render", () => {
    //     // Takes roughly 200 ms for the map to update
    //     setTimeout(() => setSpinnerLoading(false), 200);
    // });

    return data;
}

export function MapboxMap({
    paintProperty,
    setLatLng,
    currentPos,
}) {
    const [map, setMap] = useState<mapboxgl.Map | null>(null);
    const [mapboxLoading, setMapboxLoading] = useState(true);
    const timeData = useRef<TimeColorMapper | null>(null);
    const mapContainer = useRef<HTMLDivElement | null>(null);
    const [rerender, setRerender] = useState(false);

    const [detailPopup, setDetailPopup] = useState<{
        details: TripDetailsTransit[]
        seconds: number
    } | null>(null);

    const getTimeData = (): TimeColorMapper => {
        if (timeData.current != null) {
            return timeData.current;
        } else {
            throw Error("TimeData is undefined right now");
        }
    };

    const setDetailPopupInfo = (details: TripDetailsTransit[], seconds) => {
        if (!details || !seconds) setDetailPopup(null);
        else {
            setDetailPopup({
                details,
                seconds,
            });
        }
    };

    useEffect(() => {
        // Init mapbox gl map here.
        if (mapContainer.current == null) return;

        mapboxgl.accessToken =
            "pk.eyJ1IjoiaGVucnkyODMzIiwiYSI6ImNsZjhxM2lhczF4OHgzc3BxdG54MHU4eGMifQ.LpZVW1YPKfvrVgmBbEqh4A";

        const map = new mapboxgl.Map({
            container: mapContainer.current, // container ID
            style: "mapbox://styles/mapbox/dark-v11", // style URL
            center: startingLocation, // starting position [lng, lat]
            zoom: 12, // starting zoom
        });
        setMap(map);
        map.doubleClickZoom.disable();
        setupMapboxMap(
            map,
            setLatLng,
            getTimeData,
            () => {
                // setMapboxLoading(false);
            },
            setDetailPopupInfo
        );

        map.on('idle', () => {
            console.log("Done loading!", map.loaded());
            setMapboxLoading(false);
        })
    }, []);

    useEffect(() => {
        if (mapboxLoading || !paintProperty || !map) return;
        console.log("mapbox loading", mapboxLoading, paintProperty,  map.loaded())

        // let shouldRetry = false;
        // const errHandler = (err) => {
        //     if (
        //         err.error.message.includes(" does not exist in the map's style and cannot be styled.")
        //     ) {
        //         shouldRetry = true;
        //     }
        //     console.log("Error!! ", err);
        // };
        // map.once("error", errHandler);

        map.setPaintProperty("transit-layer", "line-color", [
            "coalesce",
            // ["get", ["to-string", ["id"]], ["literal", paintProperty]],
            defaultColor,
            defaultColor,
        ]);
        //
        // if (shouldRetry) {
        //     console.log("Retrying...");
        //     addMVTLayer(map);
        //     new Promise((resolve) => setTimeout(resolve, 2000)).then(() => {
        //         setRerender(!rerender);
        //     }).catch(e => {
        //         throw e
        //     })
        // }

        // map.off("error", errHandler);

        map.once("render", () => {
            // Takes roughly 200 ms for the map to update
            // setTimeout(() => setSpinnerLoading(false), 200);
        });
    }, [paintProperty, mapboxLoading, rerender]);

    useEffect(() => {
        if (map == null) return;
        map.setCenter(currentPos);
        map.setZoom(12);
    }, [currentPos]);

    return (
        <Fragment>
            {detailPopup != null ? (
                <DetailPopup details={detailPopup.details} arrival_time={detailPopup.seconds} />
            ) : null}

            {paintProperty ? (
                <ColorLegend tcm={paintProperty} currentHover={detailPopup?.seconds} />
            ) : null}

            <div ref={mapContainer} className="map w-screen h-screen overflow-none" />
        </Fragment>
    );
}
