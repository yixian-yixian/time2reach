import * as assert from "assert";

interface TripDetailsInner {
    time: number;
    line: number;
    stop: string;
}

export interface TripDetailsTransit {
    background_color: string;
    text_color: string;
    mode: string;
    boarding: TripDetailsInner;
    exit: TripDetailsInner;
    method: string;
}

export interface TripDetailsWalking {
    method: string;
    time: number;
    length: number;
}

export type TripDetails = TripDetailsTransit | TripDetailsWalking;

function toTitleCase(str) {
    return str
        .toLowerCase()
        .split(/[\s()-\/]/)
        .map(function (word) {
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(" ");
}

function formatPearsonAirport(str) {
    let regex = /(PEARSON AIRPORT TERMINAL \d+)/;

    let match = str.match(regex);
    let station = str;
    if (match) {
        station = str.match(regex)[1];
    }
    return station;
}

function formatStop(str) {
    let regex =
        /([\w.\s]+) Station - (\bNorth|\bEast|\bSouth|\bWest)bound Platform/g;

    let match = str.match(regex);
    let station = str;
    if (match) {
        const station_name = match[0];
        station = `${station_name} Station`;
    }

    station = formatPearsonAirport(station);

    return toTitleCase(station);
}

export function format_time(secs: number): string {
    return new Date(secs * 1000).toISOString().substring(11, 19);
}

function ModeIcon({
    mode,
    line_number,
    bg_color,
    text_color}
) {
    const icon = {
        bus: '<i class="fa-solid fa-bus-simple"></i>',
        tram: '<i class="fa-solid fa-train-tram"></i>',
        subway: '<i class="fa-solid fa-train-subway"></i>',
        rail: '<i class="fa-solid fa-train"></i>',
    }[mode];

    return <span class="rounded p-0.5 px-1" style={`background-color: ${bg_color}; color: ${text_color}`}>{icon} {line_number}</span>;
}

function format_walking_duration(secs: number) {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.round(secs % 60);

    if (minutes === 0) {
        return `${seconds}s`;
    } else {
        return `${minutes}m${seconds}s`;
    }
}

function format_walking_distance(length: number) {
    return `${Math.round(length / 10) * 10} meters`;
}

export function DetailEntryTransit({ detail }) {
    assert(detail.method === "Transit");

    return (
        <div class="px-2 py-1 my-3 border-l-red-200 border-l-4 rounded font-medium">
            <div>
                <span class="">
                    {<ModeIcon
                        {detail.mode,
                        detail.boarding.line,
                        detail.background_color,
                        detail.text_color
                    )}
                    {formatStop(detail.boarding.stop)}
                </span>
                <span class="text-xs text-gray-500">
                    {format_time(detail.boarding.time)}
                </span>
            </div>
            <div>
                <span>Exit at {formatStop(detail.exit.stop)}</span>
                <span class="text-xs text-gray-500">
                    {format_time(detail.exit.time)}
                </span>
            </div>
        </div>
    );
}

export function DetailEntryWalking({ detail }) {
    assert(detail.method === "Walking");
    return (
        <div className="px-2 py-1 my-1 border-l-gray-200 border-l-4 rounded font-medium">
            <div>
                <span>
                    Walk ${format_walking_duration(detail.time)} ($
                    {format_walking_distance(detail.length)})
                </span>
            </div>
        </div>
    );
}

export function DetailPopup({ details, arrival_time }) {
    const detailEntries = details.map((d) => {
        if (d.method === "Walking")
            return <DetailEntryWalking {...d}></DetailEntryWalking>;
        else return <DetailEntryTransit {...d}></DetailEntryTransit>;
    });

    return (
        <div className="border max-w-xs rounded-lg bg-slate-50 p-2 pb-1 font-sans">
            {detailEntries}
            <p>
                Arrival time <strong>${format_time(arrival_time)}</strong>
            </p>
        </div>
    );
}
