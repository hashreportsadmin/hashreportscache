import React from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hogyxhxavolnwwiduukn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvZ3l4aHhhdm9sbnd3aWR1dWtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwMzk2OTMsImV4cCI6MjEwMjYxNTY5M30.HNw9eBlxoYBzMN94kIfz2WQ-ZVZM6-V9U7QTWimZh84';
const supabaseClient = createClient(supabaseUrl, supabaseKey);

const generateId = () => 'obj_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);

const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
};

const sanitizeData = (data) => {
    if (Array.isArray(data)) return data.map(sanitizeData);
    if (data !== null && typeof data === 'object') {
        const sanitized = {};
        for (let key in data) {
            sanitized[key] = sanitizeData(data[key]);
        }
        return sanitized;
    }
    return sanitizeString(data);
};

export const dbCreateObject = async (objectType, objectData) => {
    objectData = sanitizeData(objectData);
    const id = generateId();
    // PostgreSQL automatically makes unquoted columns lowercase (objectid, objectdata)
    const payload = { objectid: id, objectdata: objectData };
    const { data, error } = await supabaseClient.from(objectType).insert([payload]).select().single();
    if (error) { console.error('Supabase Insert Error:', error); throw error; }
    return { objectId: data.objectid || data.objectId, objectType, objectData: data.objectdata || data.objectData, createdAt: data.created_at, updatedAt: data.updated_at };
};

export const dbUpdateObject = async (objectType, objectId, objectData) => {
    objectData = sanitizeData(objectData);
    const { data, error } = await supabaseClient.from(objectType).update({ objectdata: objectData, updated_at: new Date().toISOString() }).eq('objectid', objectId).select().single();
    if (error) { console.error('Supabase Update Error:', error); throw error; }
    return { objectId: data.objectid || data.objectId, objectType, objectData: data.objectdata || data.objectData, createdAt: data.created_at, updatedAt: data.updated_at };
};

export const dbGetObject = async (objectType, objectId) => {
    const { data, error } = await supabaseClient.from(objectType).select('*').eq('objectid', objectId).single();
    if (error) { console.error('Supabase Get Error:', error); throw error; }
    return { objectId: data.objectid || data.objectId, objectType, objectData: data.objectdata || data.objectData, createdAt: data.created_at, updatedAt: data.updated_at };
};

export const dbListObjects = async (objectType, limit = 1000, descent = false) => {
    const { data, error } = await supabaseClient.from(objectType).select('*').order('created_at', { ascending: !descent }).limit(limit);
    if (error) { console.error('Supabase List Error:', error); throw error; }
    return {
        items: data.map(d => ({ objectId: d.objectid || d.objectId, objectType, objectData: d.objectdata || d.objectData, createdAt: d.created_at, updatedAt: d.updated_at })),
        nextPageToken: null
    };
};

// Like dbListObjects, but filters at the database level on a field inside
// objectdata (e.g. orderId, regNumber) instead of downloading every row of
// the table and filtering in the browser. Use this whenever you only need
// "rows belonging to X" rather than the whole table.
export const dbListObjectsByField = async (objectType, field, value, limit = 1000, descent = false) => {
    const { data, error } = await supabaseClient
        .from(objectType)
        .select('*')
        .eq(`objectdata->>${field}`, value)
        .order('created_at', { ascending: !descent })
        .limit(limit);
    if (error) { console.error('Supabase List Error:', error); throw error; }
    return {
        items: data.map(d => ({ objectId: d.objectid || d.objectId, objectType, objectData: d.objectdata || d.objectData, createdAt: d.created_at, updatedAt: d.updated_at })),
        nextPageToken: null
    };
};

// Like dbListObjectsByField, but only pulls id + created_at instead of the
// full objectdata JSON. Use this when you only need to know which rows exist
// and in what order (e.g. computing a position/count), not their contents -
// it's the same information at a fraction of the bytes transferred.
export const dbListMinimalByField = async (objectType, field, value) => {
    const { data, error } = await supabaseClient
        .from(objectType)
        .select('objectid, created_at')
        .eq(`objectdata->>${field}`, value)
        .order('created_at', { ascending: true });
    if (error) { console.error('Supabase List Error:', error); throw error; }
    return {
        items: data.map(d => ({ objectId: d.objectid, createdAt: d.created_at }))
    };
};

export const dbDeleteObject = async (objectType, objectId) => {
    const { error } = await supabaseClient.from(objectType).delete().eq('objectid', objectId);
    if (error) { console.error('Supabase Delete Error:', error); throw error; }
};

// Converts a base64 data URL (e.g. "data:image/webp;base64,...") into a Blob
// for upload, without needing a fetch() round trip to decode it.
const dataUrlToBlob = (dataUrl) => {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/data:(.*?);base64/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
};

// Uploads a base64 image to Supabase Storage instead of storing it inline in
// a database row, and returns its public URL. Storing a short URL string in
// objectdata instead of a multi-hundred-KB base64 string is what actually
// fixes database egress: every future query that reads this row (including
// ones that don't even need the image) stops dragging the image bytes along
// with it every single time.
//
// This requires a public Storage bucket named "app-images" to already exist
// in the Supabase project (Storage tab -> New bucket -> Public). If it
// doesn't exist yet, or the upload fails for any reason, this throws so the
// caller can fall back to the previous inline-base64 behavior rather than
// breaking the feature entirely.
export const dbUploadImage = async (folder, base64DataUrl) => {
    if (!base64DataUrl || !base64DataUrl.startsWith('data:image')) {
        return base64DataUrl; // already a URL (or empty) - nothing to do
    }
    const blob = dataUrlToBlob(base64DataUrl);
    const ext = blob.type.split('/')[1] || 'jpg';
    const path = `${folder}/${generateId()}.${ext}`;
    const { error: uploadError } = await supabaseClient.storage
        .from('app-images')
        .upload(path, blob, { contentType: blob.type, upsert: false });
    if (uploadError) {
        console.error('Supabase Storage Upload Error:', uploadError);
        throw uploadError;
    }
    const { data } = supabaseClient.storage.from('app-images').getPublicUrl(path);
    return data.publicUrl;
};

// Deletes a previously uploaded Storage image given its public URL. Safe to
// call with a base64 string, an empty value, or a URL from a different
// bucket - it silently does nothing unless the URL is actually one of ours.
export const dbDeleteUploadedImage = async (publicUrl) => {
    if (!publicUrl || typeof publicUrl !== 'string') return;
    const marker = '/storage/v1/object/public/app-images/';
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return; // not one of our Storage URLs (e.g. still base64, or already null)
    const path = publicUrl.slice(idx + marker.length);
    try {
        await supabaseClient.storage.from('app-images').remove([path]);
    } catch (e) {
        console.error('Supabase Storage Delete Error:', e);
    }
};

export const calculateOrderProgress = (orderData, orderId, logbooksList) => {
    let completed = 0;
    let total = 55;
    
    let prog = {};
    if (orderData.progress) {
        try {
            prog = typeof orderData.progress === 'string' ? JSON.parse(orderData.progress.replace(/&quot;/g, '"')) : orderData.progress;
        } catch(e) {}
    }

    let intSup = null, extSup = null;
    try { intSup = orderData.internalSupervisor ? JSON.parse(orderData.internalSupervisor.replace(/&quot;/g, '"')) : null; } catch(e){}
    try { extSup = orderData.externalSupervisor ? JSON.parse(orderData.externalSupervisor.replace(/&quot;/g, '"')) : null; } catch(e){}
    if (intSup) completed++;
    if (extSup) completed++;

    const logbookWeeks = ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6"];
    if (logbooksList) {
        logbookWeeks.forEach(w => {
            const log = logbooksList.find(l => l.objectData.orderId === orderId && l.objectData.week === w);
            if (log && log.objectData.logbookStatus === 'digitized') completed++;
        });
    }

    const excluded = ["Uploading Logbook", "My Supervisors", "Uploading Your Complete Report"];
    if (prog) {
        Object.keys(prog).forEach(step => {
            if (!excluded.includes(step)) {
                if (prog[step]) {
                    Object.keys(prog[step]).forEach(sub => {
                        if (prog[step][sub]) completed++;
                    });
                }
            }
        });
    }

    let pct = Math.floor((completed / total) * 99);
    if (pct > 99) pct = 99;
    if (orderData.reportPdfUrl) pct += 1;

    let statusColor = 'bg-red-500';
    let statusTextClass = 'text-red-500';
    let statusLabel = 'Started';

    if (pct === 0) { statusColor = 'bg-red-500'; statusTextClass = 'text-red-500'; statusLabel = 'Not Started'; }
    else if (pct >= 100) { statusColor = 'bg-green-500'; statusTextClass = 'text-green-500'; statusLabel = 'Completed'; }
    else if (pct > 90) { statusColor = 'bg-blue-600'; statusTextClass = 'text-blue-600'; statusLabel = 'Finalizing'; }
    else if (pct > 70) { statusColor = 'bg-green-500'; statusTextClass = 'text-green-500'; statusLabel = 'Almost'; }
    else if (pct > 30) { statusColor = 'bg-yellow-400'; statusTextClass = 'text-yellow-600'; statusLabel = 'In Progress'; }
    else { statusColor = 'bg-orange-500'; statusTextClass = 'text-orange-500'; statusLabel = 'Started'; }

    return { pct, color: statusColor, textColor: statusTextClass, status: statusLabel };
};
