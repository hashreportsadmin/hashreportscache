import React from 'react';
import { Popup } from './SharedUI';
import { Welcome } from './Welcome';
import { calculateOrderProgress, dbCreateObject, dbDeleteObject, dbListObjects, dbUpdateObject } from '../utils/db';

// --- Admin panel permanent cache ------------------------------------------
// Every collection the admin panel uses is cached in localStorage. That
// means switching between nav tabs (Dashboard, Pending Orders, Logbooks,
// etc.) never re-fetches from the database - they all just read from the
// same already-loaded, already-cached state. The cache also survives
// signing out and closing the browser: on the next visit the panel renders
// straight from the cached copy instead of waiting on a database call. A
// single lightweight background sync (not tied to tab navigation) keeps
// checking the database and updates the cache + screen the instant
// something actually changes; when nothing has changed it doesn't touch
// state at all, so it behaves exactly like a pure cache read.
const ADMIN_CACHE_KEYS = {
    users: 'admin_cache_users',
    passwordRequests: 'admin_cache_password_requests',
    fieldOrders: 'admin_cache_field_orders',
    logbooks: 'admin_cache_logbooks'
};

const readAdminCache = (key) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
};

const writeAdminCache = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
};

// A drop-in replacement for React.useState that transparently persists
// every update to localStorage under `cacheKey`, and seeds its initial
// value from that cache. Every existing setUsers/setFieldOrders/etc. call
// site keeps working unchanged - it now just also writes through to the
// permanent cache automatically.
const useCachedState = (cacheKey, initialValue) => {
    const [state, setState] = React.useState(() => {
        const cached = readAdminCache(cacheKey);
        return cached !== null ? cached : initialValue;
    });
    const setCachedState = React.useCallback((updater) => {
        setState(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            writeAdminCache(cacheKey, next);
            return next;
        });
    }, [cacheKey]);
    return [state, setCachedState];
};

const getAdminStepIcon = (title) => {
    if(title.includes('Logbook')) return 'book';
    if(title.includes('Supervisors')) return 'users';
    if(title.includes('Cover Page')) return 'image';
    if(title.includes('Declaration')) return 'file-check';
    if(title.includes('Acknowledgement')) return 'thumbs-up';
    if(title.includes('Summary')) return 'file-text';
    if(title.includes('Table')) return 'list';
    if(title.includes('Abbreviations')) return 'type';
    if(title.includes('Figures')) return 'image';
    if(title.includes('Chapter')) return 'folder-open';
    if(title.includes('References')) return 'link';
    if(title.includes('Appendices')) return 'paperclip';
    if(title.includes('Uploading Your Complete Report')) return 'upload-cloud';
    return 'file';
};

const adminDashboardStepsData = [
    { title: "Uploading Logbook", subSteps: ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6"] },
    { title: "My Supervisors", subSteps: ["Internal FIELD Supervisor", "External UDOM Supervisor"] },
    { title: "Cover Page", subSteps: ["Logo", "University Details", "Field Details", "Student Details"] },
    { title: "Declaration", subSteps: ["Introduction", "Main Body", "Signature Part"] },
    { title: "Acknowledgement", subSteps: ["Organization", "Internal FIELD Supervisor", "External UDOM Supervisor", "Overall"] },
    { title: "Executive Summary", subSteps: ["Introduction", "Main Body", "Conclusion"] },
    { title: "Table of Contents", subSteps: ["Chapter One: Introduction", "Chapter Two: Description and Analysis", "Chapter Three: Problem Identification", "Chapter Four: Discussion", "Chapter Five: Conclusion and Recommendations", "References", "Appendices"] },
    { title: "List of Abbreviations", subSteps: ["Abbreviations"] },
    { title: "List of Figures", subSteps: ["Organizational Structure"] },
    { title: "Chapter One: Introduction", subSteps: ["Back ground of the Organization", "Vision Statement", "Mission statement", "Organizational Slogan/Motto", "Organizational core Values", "Organizational Objectives", "Organizational core Activities and Services", "Organizational clients", "Organization Structure & Departments"] },
    { title: "Chapter Two: Description and Analysis", subSteps: ["Sections and Departments", "In office and Out Office Activities", "Individual and Group Activities"] },
    { title: "Chapter Three: Problem Identification", subSteps: ["Organizational Problems/ Challenges", "Personal Problems/ Challenges", "Personal Efforts to Address"] },
    { title: "Chapter Four: Discussion", subSteps: ["Relevance of Field and Class", "New Skills Acquired"] },
    { title: "Chapter Five: Conclusion and Recommendations", subSteps: ["Conclusion", "Recommendations to Organization", "Recommendations to UDOM"] },
    { title: "References", subSteps: ["Primary References", "Secondary References", "Tertiary References"] },
    { title: "Appendices", subSteps: ["Informed Consent"] },
    { title: "Uploading Your Complete Report", subSteps: ["Complete Field Report"] }
];

const AdminDashboard = ({ onLogout }) => {
    const adminAuthority = localStorage.getItem('adminAuthority') || "Chief Executive Officer";
    const [activeTab, setActiveTab] = React.useState('Dashboard');
    const [searchQuery, setSearchQuery] = React.useState('');
    const [users, setUsers] = useCachedState(ADMIN_CACHE_KEYS.users, []);
    const [allPaidOrders, setAllPaidOrders] = React.useState(() => {
        const cachedOrders = readAdminCache(ADMIN_CACHE_KEYS.fieldOrders) || [];
        return cachedOrders
            .filter(o => o.objectData.status === 'PAID')
            .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    });
    const [passwordRequests, setPasswordRequests] = useCachedState(ADMIN_CACHE_KEYS.passwordRequests, []);
    const [fieldOrders, setFieldOrders] = useCachedState(ADMIN_CACHE_KEYS.fieldOrders, []);
    const [logbooks, setLogbooks] = useCachedState(ADMIN_CACHE_KEYS.logbooks, []);
    const [showPopup, setShowPopup] = React.useState(false);
    const [userToDelete, setUserToDelete] = React.useState(null);
    const [visiblePasswords, setVisiblePasswords] = React.useState({});
    
    // Tracking Popup State
    const [trackingOrder, setTrackingOrder] = React.useState(null);
    const [expandedStep, setExpandedStep] = React.useState(null);
    
    // Admin Logbook viewing
    const [viewingLogbook, setViewingLogbook] = React.useState(null); 
    const [confirmDialog, setConfirmDialog] = React.useState(null);
    const [infoDialog, setInfoDialog] = React.useState(null);
    const [unmarkDialog, setUnmarkDialog] = React.useState(null);
    const [digitizingState, setDigitizingState] = React.useState({});
    const [authPopupMsg, setAuthPopupMsg] = React.useState(null);
    const [selectedUserForDetails, setSelectedUserForDetails] = React.useState(null);
    const [selectedFieldOrderForDetails, setSelectedFieldOrderForDetails] = React.useState(null);
    const [selectedOrderForSupervisors, setSelectedOrderForSupervisors] = React.useState(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

    const checkAuth = (actionContext) => {
        if (adminAuthority === 'Chief Executive Officer') return true;

        if (adminAuthority === 'Report Writer') {
            const allowedContexts = ['pending_orders', 'settled_orders', 'logbooks', 'viewing'];
            if (allowedContexts.includes(actionContext)) return true;
            setAuthPopupMsg("This action is not authorized to Report Writers. Contact your CEO incase of emergencies.");
            return false;
        }

        if (adminAuthority === 'Accountant') {
            const allowedContexts = ['toggle_paid'];
            if (allowedContexts.includes(actionContext)) return true;
            setAuthPopupMsg("This action is not authorized to Accountants. Contact your CEO incase of emergencies.");
            return false;
        }
        
        return false;
    };

    const chartRef = React.useRef(null);
    const chartInstanceRef = React.useRef(null);
    const doughnutRef = React.useRef(null);
    const doughnutInstanceRef = React.useRef(null);
    const revenueChartRef = React.useRef(null);
    const revenueInstanceRef = React.useRef(null);
    const regionChartRef = React.useRef(null);
    const regionInstanceRef = React.useRef(null);
    
    // Additional charts
    const typeChartRef = React.useRef(null);
    const typeInstanceRef = React.useRef(null);
    const activityChartRef = React.useRef(null);
    const activityInstanceRef = React.useRef(null);

    const navItems = ['Dashboard', 'Registered Users', 'Deleted Users', 'Password Requests', 'Field Report Orders', 'Logbooks', 'Supervisors', 'Pending Orders', 'Settled Orders', 'Cancelled Orders'];

    const loadData = async () => {
        try {
            const sortByDateDesc = (items) => [...items].sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            
            const userRes = await dbListObjects('user', 1000, false);
            const sortedUsers = sortByDateDesc(userRes.items);
            setUsers(prev => JSON.stringify(prev) !== JSON.stringify(sortedUsers) ? sortedUsers : prev);
            
            const reqsRes = await dbListObjects('password_request', 1000, false);
            const sortedReqs = sortByDateDesc(reqsRes.items);
            setPasswordRequests(prev => JSON.stringify(prev) !== JSON.stringify(sortedReqs) ? sortedReqs : prev);

            const ordersRes = await dbListObjects('field_report_order', 1000, false);
            const sortedOrders = sortByDateDesc(ordersRes.items);
            setFieldOrders(prev => JSON.stringify(prev) !== JSON.stringify(sortedOrders) ? sortedOrders : prev);
            
            const paid = ordersRes.items.filter(o => o.objectData.status === 'PAID').sort((a,b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
            setAllPaidOrders(prev => JSON.stringify(prev) !== JSON.stringify(paid) ? paid : prev);

            const logsRes = await dbListObjects('logbook', 1000, false);
            const sortedLogs = sortByDateDesc(logsRes.items);
            setLogbooks(prev => JSON.stringify(prev) !== JSON.stringify(sortedLogs) ? sortedLogs : prev);
        } catch (e) {
            console.error("Failed to load DB data", e);
        }
    };
    
    const markSupervisorSeen = async (order, type) => {
        try {
            const field = type === 'internal' ? 'internalSupervisorChanged' : 'externalSupervisorChanged';
            await dbUpdateObject('field_report_order', order.objectId, { ...order.objectData, [field]: false });
            setFieldOrders(fieldOrders.map(o => o.objectId === order.objectId ? { ...o, objectData: { ...o.objectData, [field]: false } } : o));
        } catch(e) { console.error(e); }
    };

    const getOrderNumber = (order) => {
        if (order.objectData.status === 'PAID') {
            const index = allPaidOrders.findIndex(o => o.objectId === order.objectId);
            if (index !== -1) return `HR0801-${String(index + 1).padStart(2, '0')}`;
        }
        return `Order #${order.objectId.substring(order.objectId.length - 6).toUpperCase()}`;
    };

    React.useEffect(() => {
        let isMounted = true;
        // Runs once on mount (not on every tab click) so navigating between
        // Dashboard / Pending Orders / Logbooks / etc. is always served from
        // the already-loaded, cached state - no per-tab database fetch.
        loadData();
        const intervalId = setInterval(() => {
            if (isMounted) loadData();
        }, 5000);
        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, []);

    React.useEffect(() => {
        setSearchQuery('');
    }, [activeTab]);

    // Initialize Charts on Dashboard Tab
    React.useEffect(() => {
        if (activeTab === 'Dashboard' && typeof window.Chart !== 'undefined') {
            if (chartInstanceRef.current) chartInstanceRef.current.destroy();
            if (doughnutInstanceRef.current) doughnutInstanceRef.current.destroy();
            if (revenueInstanceRef.current) revenueInstanceRef.current.destroy();
            if (regionInstanceRef.current) regionInstanceRef.current.destroy();
            if (typeInstanceRef.current) typeInstanceRef.current.destroy();
            if (activityInstanceRef.current) activityInstanceRef.current.destroy();

            const activeFieldOrders = fieldOrders.filter(order => {
                const u = users.find(user => user.objectData.regNumber === order.objectData.regNumber);
                return u && !u.objectData.deleted;
            });

            const paidOrders = activeFieldOrders.filter(o => o.objectData.status === 'PAID');
            const pendingOrders = paidOrders.filter(o => !o.objectData.settled).length;
            const settledOrders = paidOrders.filter(o => o.objectData.settled).length;
            const unpaidOrders = activeFieldOrders.filter(o => o.objectData.status === 'UNPAID' && o.objectData.status !== 'CANCELLED').length;
            const cancelledOrders = activeFieldOrders.filter(o => o.objectData.status === 'CANCELLED').length;

            // Real last-8-months buckets (ending this month) for the Orders
            // and Revenue charts below, instead of the previous hardcoded
            // placeholder numbers - each bucket counts actual orders whose
            // createdAt falls in that month.
            const now = new Date();
            const monthBuckets = Array.from({ length: 8 }, (_, i) => {
                const d = new Date(now.getFullYear(), now.getMonth() - (7 - i), 1);
                return { label: d.toLocaleString('default', { month: 'short' }), year: d.getFullYear(), month: d.getMonth() };
            });
            const ordersByMonth = monthBuckets.map(b => activeFieldOrders.filter(o => {
                const d = new Date(o.createdAt);
                return d.getFullYear() === b.year && d.getMonth() === b.month;
            }).length);
            const revenueByMonth = monthBuckets.map(b => paidOrders.filter(o => {
                const d = new Date(o.createdAt);
                return d.getFullYear() === b.year && d.getMonth() === b.month;
            }).length * 15000);

            if (chartRef.current) {
                chartInstanceRef.current = new window.Chart(chartRef.current, {
                    type: 'bar',
                    data: {
                        labels: monthBuckets.map(b => b.label),
                        datasets: [{
                            label: 'Orders',
                            data: ordersByMonth,
                            backgroundColor: '#0077be',
                            borderRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { font: { size: 9 } } },
                            x: { grid: { display: false }, ticks: { font: { size: 9 } } }
                        }
                    }
                });
            }

            if (doughnutRef.current) {
                doughnutInstanceRef.current = new window.Chart(doughnutRef.current, {
                    type: 'doughnut',
                    data: {
                        labels: ['Pending', 'Settled', 'Unpaid', 'Cancelled'],
                        datasets: [{
                            data: [pendingOrders, settledOrders, unpaidOrders, cancelledOrders],
                            backgroundColor: ['#f59e0b', '#22c55e', '#ef4444', '#6b7280'],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '70%',
                        plugins: { legend: { display: false } }
                    }
                });
            }

            if (revenueChartRef.current) {
                revenueInstanceRef.current = new window.Chart(revenueChartRef.current, {
                    type: 'line',
                    data: {
                        labels: monthBuckets.map(b => b.label),
                        datasets: [{
                            label: 'Revenue (TZS)',
                            data: revenueByMonth,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4,
                            pointRadius: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { font: { size: 9 } } },
                            x: { grid: { display: false }, ticks: { font: { size: 9 } } }
                        }
                    }
                });
            }

            if (regionChartRef.current) {
                const regionCounts = {};
                activeFieldOrders.forEach(o => {
                    if(o.objectData.region) {
                        regionCounts[o.objectData.region] = (regionCounts[o.objectData.region] || 0) + 1;
                    }
                });
                if (Object.keys(regionCounts).length === 0) regionCounts['Dodoma'] = 1;

                regionInstanceRef.current = new window.Chart(regionChartRef.current, {
                    type: 'polarArea',
                    data: {
                        labels: Object.keys(regionCounts),
                        datasets: [{
                            data: Object.values(regionCounts),
                            backgroundColor: [
                                'rgba(59, 130, 246, 0.7)',
                                'rgba(16, 185, 129, 0.7)',
                                'rgba(245, 158, 11, 0.7)',
                                'rgba(139, 92, 246, 0.7)',
                                'rgba(236, 72, 153, 0.7)',
                                'rgba(99, 102, 241, 0.7)'
                            ],
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'right', labels: { boxWidth: 8, font: { size: 9 } } } }
                    }
                });
            }

            if (typeChartRef.current) {
                typeInstanceRef.current = new window.Chart(typeChartRef.current, {
                    type: 'pie',
                    data: {
                        labels: ['Field Report', 'Research Report'],
                        datasets: [{
                            data: [
                                activeFieldOrders.filter(o => o.objectData.reportType === 'Field Report').length,
                                activeFieldOrders.filter(o => o.objectData.reportType === 'Research Report').length
                            ],
                            backgroundColor: ['#3b82f6', '#8b5cf6'],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 9 } } } }
                    }
                });
            }

            if (activityChartRef.current) {
                // Real, derived metrics instead of hardcoded placeholder
                // numbers - each is a percentage of activeFieldOrders so
                // all five axes sit on a comparable 0-100 scale.
                const totalOrdersForActivity = activeFieldOrders.length || 1;
                const totalLogbookSlots = activeFieldOrders.length * 6 || 1;
                const digitizedLogbookCount = logbooks.filter(l => l.objectData.logbookStatus === 'digitized').length;
                const uploadsPct = Math.round((digitizedLogbookCount / totalLogbookSlots) * 100);
                const editsCount = activeFieldOrders.filter(o => o.objectData.internalSupervisorChanged || o.objectData.externalSupervisorChanged).length;
                const editsPct = Math.round((editsCount / totalOrdersForActivity) * 100);
                const settledPct = Math.round((settledOrders / totalOrdersForActivity) * 100);
                const paymentsPct = Math.round((paidOrders.length / totalOrdersForActivity) * 100);
                const downloadsCount = activeFieldOrders.filter(o => o.objectData.reportPdfUrl).length;
                const downloadsPct = Math.round((downloadsCount / totalOrdersForActivity) * 100);

                activityInstanceRef.current = new window.Chart(activityChartRef.current, {
                    type: 'radar',
                    data: {
                        labels: ['Logbook Uploads', 'Supervisor Edits', 'Settled', 'Payments', 'Report Downloads'],
                        datasets: [{
                            label: 'Order Activity (%)',
                            data: [uploadsPct, editsPct, settledPct, paymentsPct, downloadsPct],
                            backgroundColor: 'rgba(236, 72, 153, 0.2)',
                            borderColor: 'rgba(236, 72, 153, 1)',
                            pointBackgroundColor: 'rgba(236, 72, 153, 1)',
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { r: { beginAtZero: true, max: 100, ticks: { display: false } } }
                    }
                });
            }
        }
        return () => {
            if (chartInstanceRef.current) chartInstanceRef.current.destroy();
            if (doughnutInstanceRef.current) doughnutInstanceRef.current.destroy();
            if (revenueInstanceRef.current) revenueInstanceRef.current.destroy();
            if (regionInstanceRef.current) regionInstanceRef.current.destroy();
            if (typeInstanceRef.current) typeInstanceRef.current.destroy();
            if (activityInstanceRef.current) activityInstanceRef.current.destroy();
        };
    }, [activeTab, fieldOrders, users, logbooks]);

    const togglePasswordVisibility = (id) => {
        if (!checkAuth('view_password')) return;
        setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const confirmDelete = (user) => {
        if (!checkAuth('delete_user')) return;
        setUserToDelete(user);
        setShowPopup(true);
    };

    const handleDelete = async () => {
        if (userToDelete) {
            try {
                await dbDeleteObject('user', userToDelete.objectId);
                setUsers(users.filter(u => u.objectId !== userToDelete.objectId));
            } catch (e) {
                console.error("Failed to delete user", e);
            } finally {
                setShowPopup(false);
                setUserToDelete(null);
            }
        }
    };

    const handleRestoreUser = (user) => {
        if (!checkAuth('restore_user')) return;
        setConfirmDialog({
            title: "Restore User",
            message: "Are you sure you want to restore this user account?",
            icon: "🔄",
            onConfirm: async () => {
                try {
                    await dbUpdateObject('user', user.objectId, { ...user.objectData, deleted: false });
                    setUsers(users.map(u => u.objectId === user.objectId ? { ...u, objectData: { ...u.objectData, deleted: false } } : u));
                } catch(e) {
                    console.error("Failed to restore user", e);
                } finally {
                    setConfirmDialog(null);
                }
            }
        });
    };

    const handleApproveRequest = async (request) => {
        if (!checkAuth('approve_password')) return;
        try {
            await dbUpdateObject('password_request', request.objectId, {
                ...request.objectData,
                status: 'approved'
            });
            setPasswordRequests(passwordRequests.map(r => 
                r.objectId === request.objectId ? { ...r, objectData: { ...r.objectData, status: 'approved' } } : r
            ));
        } catch (e) {
            console.error("Failed to approve request", e);
        }
    };

    const getOrdersWithUserDetails = (filterFn) => {
        return fieldOrders.filter(filterFn).filter(order => {
            const u = users.find(user => user.objectData.regNumber === order.objectData.regNumber);
            return u && !u.objectData.deleted;
        }).map(order => {
            const u = users.find(user => user.objectData.regNumber === order.objectData.regNumber);
            return { ...order, userDetails: u };
        });
    };

    const applySearch = (items, fieldsFunc) => {
        if (!searchQuery) return items;
        const query = searchQuery.toLowerCase();
        return items.filter(item => {
            const fields = fieldsFunc(item);
            return fields.some(field => field && field.toLowerCase().includes(query));
        });
    };

    const handleToggleOrderStatus = async (order) => {
        if (!checkAuth('toggle_paid')) return;
        const newStatus = order.objectData.status === 'UNPAID' ? 'PAID' : 'UNPAID';
        try {
            await dbUpdateObject('field_report_order', order.objectId, {
                ...order.objectData,
                status: newStatus
            });
            
            if (newStatus === 'PAID') {
                await dbCreateObject('notification', {
                    regNumber: order.objectData.regNumber,
                    title: 'Payment Confirmed',
                    message: `Your TZS 15,000 payment for Field Report Order has been confirmed. Your Report will now start to be written.`,
                    isRead: false,
                    icon: 'badge-check'
                });
            }
            
            setFieldOrders(fieldOrders.map(o => 
                o.objectId === order.objectId ? { ...o, objectData: { ...o.objectData, status: newStatus } } : o
            ));
        } catch(e) {
            console.error("Failed to update status", e);
        }
    };

    const handleRestoreOrder = (order) => {
        if (!checkAuth('restore_order')) return;
        setConfirmDialog({
            title: "Restore Order",
            message: "Are you sure you want to restore this order? This will start the order afresh and delete all logbooks.",
            icon: "🔄",
            onConfirm: async () => {
                try {
                    const orderLogbooks = logbooks.filter(l => l.objectData.orderId === order.objectId);
                    for (const log of orderLogbooks) {
                        await dbDeleteObject('logbook', log.objectId);
                    }
                    setLogbooks(logbooks.filter(l => l.objectData.orderId !== order.objectId));

                    const newObjectData = {
                        ...order.objectData,
                        status: 'UNPAID',
                        progress: '{}',
                        settled: false,
                        isUploading: false,
                        reportPdfUrl: null
                    };
                    await dbUpdateObject('field_report_order', order.objectId, newObjectData);
                    setFieldOrders(fieldOrders.map(o => o.objectId === order.objectId ? { ...o, objectData: newObjectData } : o));
                } catch (e) {
                    console.error("Failed to restore order", e);
                } finally {
                    setConfirmDialog(null);
                }
            }
        });
    };

    const handleDeleteOrder = (orderId) => {
        if (!checkAuth('delete_order')) return;
        setConfirmDialog({
            title: "Delete Order",
            message: "Are you sure you want to delete this order?",
            icon: "🗑️",
            onConfirm: async () => {
                try {
                    await dbDeleteObject('field_report_order', orderId);
                    setFieldOrders(fieldOrders.filter(o => o.objectId !== orderId));
                } catch(e) {
                    console.error("Failed to delete order", e);
                } finally {
                    setConfirmDialog(null);
                }
            }
        });
    };

    // Tracking Logic
    const initializeProgress = (order) => {
        let prog = {};
        if (order.objectData?.progress) {
            try {
                prog = typeof order.objectData.progress === 'string' ? JSON.parse(order.objectData.progress.replace(/&quot;/g, '"')) : order.objectData.progress;
                return prog;
            } catch (e) { }
        }
        adminDashboardStepsData.forEach((step) => {
            prog[step.title] = {};
            step.subSteps.forEach(sub => prog[step.title][sub] = false);
        });
        return prog;
    };

    const checkIsSettled = (prog, currentOrderId) => {
        const currentLogbooks = logbooks.filter(l => l.objectData.orderId === currentOrderId);
        for (let step of adminDashboardStepsData) {
            if (step.title === "Uploading Your Complete Report") continue;
            if (step.title === "Uploading Logbook") {
                for (let sub of step.subSteps) {
                    const log = currentLogbooks.find(l => l.objectData.week === sub);
                    if (!log || log.objectData.logbookStatus !== 'digitized') return false;
                }
            } else {
                for (let sub of step.subSteps) {
                    if (!prog[step.title] || !prog[step.title][sub]) {
                        return false;
                    }
                }
            }
        }
        return true;
    };

    const executeToggleSubStep = async (order, stepTitle, subStep, currentProg, isTurningOff) => {
        currentProg[stepTitle][subStep] = !isTurningOff;
        const isSettled = checkIsSettled(currentProg, order.objectId);

        try {
            const newObjectData = {
                ...order.objectData,
                progress: JSON.stringify(currentProg),
                settled: isSettled
            };
            
            if (order.objectData.settled && !isSettled) {
                newObjectData.reportPdfUrl = null;
            }

            await dbUpdateObject('field_report_order', order.objectId, newObjectData);
            
            if (isSettled && !order.objectData.settled) {
                await dbCreateObject('notification', {
                    regNumber: order.objectData.regNumber,
                    title: 'Order Completed',
                    message: `Great news! Your report for ${order.objectData.organizationName} is fully completed and ready for download.`,
                    isRead: false,
                    icon: 'circle-check'
                });
            } else if (!isTurningOff) {
                await dbCreateObject('notification', {
                    regNumber: order.objectData.regNumber,
                    title: 'Task Completed',
                    message: `Your ${subStep} is completed in ${stepTitle}.`,
                    isRead: false,
                    icon: getAdminStepIcon(stepTitle)
                });
            }
            
            const updatedOrder = { ...order, objectData: newObjectData };
            setFieldOrders(fieldOrders.map(o => o.objectId === order.objectId ? updatedOrder : o));
            if (trackingOrder && trackingOrder.objectId === order.objectId) {
                if (isSettled && !order.objectData.settled) {
                    setTrackingOrder(null);
                    setInfoDialog({
                        title: "Order Completed",
                        message: "The order is fully completed and has been successfully moved to Settled Orders.",
                        icon: "✅"
                    });
                } else if (!isSettled && order.objectData.settled) {
                    setTrackingOrder(null);
                } else {
                    setTrackingOrder(updatedOrder);
                }
            }
        } catch(e) {
            console.error(e);
        }
    };

    const handleToggleSubStep = async (order, stepTitle, subStep) => {
        if (!checkAuth('pending_orders') && !checkAuth('settled_orders')) return;
        if (stepTitle === "Uploading Logbook") return; 
        
        const currentProg = initializeProgress(order);
        currentProg[stepTitle] = currentProg[stepTitle] || {};
        const isTurningOff = currentProg[stepTitle][subStep];

        if (order.objectData.settled && isTurningOff) {
            setUnmarkDialog({
                order,
                stepTitle,
                subStep,
                currentProg,
                isTurningOff
            });
            return;
        }

        await executeToggleSubStep(order, stepTitle, subStep, currentProg, isTurningOff);
    };

    const handleUploadReport = (order) => {
        if (!checkAuth('settled_orders')) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/pdf';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                const updatedOrderData = { ...order.objectData, isUploading: true };
                setFieldOrders(fieldOrders.map(o => o.objectId === order.objectId ? { ...o, objectData: updatedOrderData } : o));
                
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const base64Pdf = ev.target.result;
                    try {
                        const finalObjectData = {
                            ...updatedOrderData,
                            isUploading: false,
                            reportPdfUrl: base64Pdf
                        };
                        await dbUpdateObject('field_report_order', order.objectId, finalObjectData);
                        setFieldOrders(fieldOrders.map(o => o.objectId === order.objectId ? { ...o, objectData: finalObjectData } : o));
                    } catch(err) {
                        console.error(err);
                    }
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    };

    const handleDigitizeUpload = (logbookId) => {
        if (!checkAuth('logbooks')) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                setDigitizingState(prev => ({ ...prev, [logbookId]: 'DIGITIZING' }));
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const img = new Image();
                    img.onerror = () => {
                        alert("Invalid image format or corrupted file. Please try another image.");
                        setDigitizingState(prev => {
                            const next = { ...prev };
                            delete next[logbookId];
                            return next;
                        });
                    };
                    img.onload = async () => {
                        try {
                            const canvas = document.createElement('canvas');
                            let width = img.width;
                            let height = img.height;
                            const max_size = 1000;
                            if (width > height && width > max_size) {
                                height *= max_size / width;
                                width = max_size;
                            } else if (height > max_size) {
                                width *= max_size / height;
                                height = max_size;
                            }
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx.fillStyle = "#ffffff";
                            ctx.fillRect(0, 0, width, height);
                            ctx.drawImage(img, 0, 0, width, height);
                            const base64Image = canvas.toDataURL('image/jpeg', 0.6);
                            
                            const log = logbooks.find(l => l.objectId === logbookId);
                            if(log) {
                                const newObj = {
                                    ...log.objectData,
                                    digitizedImage: base64Image,
                                    logbookStatus: 'digitized'
                                };
                                await dbUpdateObject('logbook', logbookId, newObj);
                                
                                setLogbooks(prev => {
                                    const nextLogs = prev.map(l => l.objectId === logbookId ? { ...l, objectData: newObj } : l);
                                    
                                    const orderToUpdate = fieldOrders.find(o => o.objectId === log.objectData.orderId);
                                    if (orderToUpdate && !orderToUpdate.objectData.settled) {
                                        let currentProg = {};
                                        try { currentProg = typeof orderToUpdate.objectData.progress === 'string' ? JSON.parse(orderToUpdate.objectData.progress.replace(/&quot;/g, '"')) : orderToUpdate.objectData.progress; } catch(e){}
                                        if (!currentProg["Uploading Logbook"]) {
                                            adminDashboardStepsData.forEach((step) => {
                                                currentProg[step.title] = {};
                                                step.subSteps.forEach(sub => currentProg[step.title][sub] = false);
                                            });
                                        }
                                        
                                        let isSettled = true;
                                        for (let step of adminDashboardStepsData) {
                                            if (step.title === "Uploading Your Complete Report") continue;
                                            if (step.title === "Uploading Logbook") {
                                                for (let sub of step.subSteps) {
                                                    const l = nextLogs.find(lg => lg.objectData.orderId === orderToUpdate.objectId && lg.objectData.week === sub);
                                                    if (!l || String(l.objectData.logbookStatus).toLowerCase() !== 'digitized') { isSettled = false; break; }
                                                }
                                            } else {
                                                for (let sub of step.subSteps) {
                                                    if (!currentProg[step.title] || !currentProg[step.title][sub]) {
                                                        isSettled = false; break;
                                                    }
                                                }
                                            }
                                            if (!isSettled) break;
                                        }
                                        
                                        if (isSettled) {
                                            const finalOrderData = { ...orderToUpdate.objectData, settled: true };
                                            dbUpdateObject('field_report_order', orderToUpdate.objectId, finalOrderData).then(() => {
                                                dbCreateObject('notification', {
                                                    regNumber: orderToUpdate.objectData.regNumber,
                                                    title: 'Order Completed',
                                                    message: `Great news! Your report for ${orderToUpdate.objectData.organizationName} is fully completed and ready for download.`,
                                                    isRead: false,
                                                    icon: 'circle-check'
                                                });
                                                setFieldOrders(orders => orders.map(o => o.objectId === orderToUpdate.objectId ? { ...o, objectData: finalOrderData } : o));
                                                setInfoDialog({
                                                    title: "Order Completed",
                                                    message: "The order is fully completed and has been successfully moved to Settled Orders.",
                                                    icon: "✅"
                                                });
                                                if (trackingOrder && trackingOrder.objectId === orderToUpdate.objectId) {
                                                    setTrackingOrder(null);
                                                }
                                            });
                                        }
                                    }
                                    return nextLogs;
                                });
                            }
                        } catch(err) {
                            console.error("Upload error: ", err);
                            alert("Failed to upload digitized logbook.");
                        } finally {
                            setDigitizingState(prev => {
                                const next = { ...prev };
                                delete next[logbookId];
                                return next;
                            });
                        }
                    };
                    img.src = ev.target.result;
                };
                reader.onerror = () => {
                    setDigitizingState(prev => {
                        const next = { ...prev };
                        delete next[logbookId];
                        return next;
                    });
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    };

    const getStepStatus = (prog, stepTitle, subSteps, orderId) => {
        if (stepTitle === "Uploading Your Complete Report") {
            const order = fieldOrders.find(o => o.objectId === orderId);
            if (!order) return 'Pending';
            if (order.objectData?.settled && order.objectData?.reportPdfUrl) return 'Completed';
            if (order.objectData?.settled && !order.objectData?.reportPdfUrl) return 'In Progress';
            return 'Pending';
        }

        let completedCount = 0;
        if (stepTitle === "Uploading Logbook") {
            const currentLogbooks = logbooks.filter(l => l.objectData.orderId === orderId);
            completedCount = subSteps.filter(sub => {
                const log = currentLogbooks.find(l => l.objectData.week === sub);
                return log && log.objectData.logbookStatus === 'digitized';
            }).length;
        } else if (stepTitle === "My Supervisors") {
            const order = fieldOrders.find(o => o.objectId === orderId);
            if (order) {
                if (order.objectData.internalSupervisor) completedCount++;
                if (order.objectData.externalSupervisor) completedCount++;
            }
        } else {
            completedCount = subSteps.filter(sub => prog[stepTitle] && prog[stepTitle][sub]).length;
        }
        
        if (completedCount === 0) return 'Pending';
        if (completedCount === subSteps.length) return 'Completed';
        return 'In Progress';
    };

    const renderSearchHeader = (title) => (
        <div className="sticky top-0 z-20 bg-gray-50 pb-2 pt-0 shrink-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <h1 className="text-lg font-bold text-[var(--primary-color)]">{title}</h1>
                <div className="relative max-w-xs w-full">
                    <input 
                        type="text"
                        placeholder="Search here..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-[11px] focus:outline-none focus:border-[var(--primary-color)] focus:ring-1 focus:ring-[var(--primary-color)] shadow-sm"
                    />
                    <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                        <div className="icon-search text-xs"></div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderOrdersTable = (orders, actionType) => (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col flex-1 min-h-0 mt-4 relative">
            <div className="flex-1 overflow-auto edge-scrollbar">
                <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                    <thead className="bg-gray-100 text-gray-700 font-semibold uppercase text-[9px] tracking-wider sticky top-0 z-10 shadow-[0_1px_0_rgba(229,231,235,1)]">
                        <tr>
                            <th className="px-3 py-2 bg-gray-100">Progress</th>
                            <th className="px-3 py-2 bg-gray-100">Profile</th>
                            <th className="px-3 py-2 bg-gray-100">Name</th>
                            <th className="px-3 py-2 bg-gray-100">Reg Number</th>
                            {actionType !== 'cancelled' && <th className="px-3 py-2 bg-gray-100">Order No</th>}
                            <th className="px-3 py-2 bg-gray-100">Organization</th>
                            <th className="px-3 py-2 bg-gray-100">Location</th>
                            <th className="px-3 py-2 bg-gray-100">Duration</th>
                            {actionType ? (
                                <th className="px-3 py-2 text-center bg-gray-100">Action</th>
                            ) : null}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {orders.length === 0 ? (
                            <tr>
                                <td colSpan={actionType ? 9 : 8} className="px-3 py-8 text-center text-gray-500">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="icon-search text-3xl opacity-20"></div>
                                        <span>No orders found.</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            orders.map((order, i) => (
                                <tr key={i} className="hover:bg-blue-50/50 transition-colors cursor-pointer group" onClick={() => { 
                                    if ((!actionType && checkAuth('pending_orders')) || (actionType === 'settled' && checkAuth('settled_orders'))) {
                                        setTrackingOrder(order); 
                                    }
                                }}>
                                    <td className="px-3 py-2">
                                        {(() => {
                                            const { pct, color, textColor, status } = calculateOrderProgress(order.objectData, order.objectId, logbooks);
                                            return (
                                                <div className="flex flex-col gap-1 w-[80px]">
                                                    <div className="flex justify-between items-end">
                                                        <span className={`text-[9px] font-bold ${textColor}`}>{status}</span>
                                                        <span className="text-[9px] font-bold text-gray-600">{pct}%</span>
                                                    </div>
                                                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden flex">
                                                        <div className={`${color} h-full rounded-full`} style={{ width: `${pct}%` }}></div>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 shadow-sm bg-gray-100">
                                            {order.userDetails.objectData?.photoUrl ? (
                                                <img src={order.userDetails.objectData.photoUrl} alt="profile" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="icon-user text-gray-400 w-full h-full flex items-center justify-center"></div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 font-medium text-gray-900 text-[11px]">{order.userDetails.objectData?.fullName || 'Unknown'}</td>
                                    <td className="px-3 py-2 font-mono text-[10px] text-gray-600">{order.objectData.regNumber}</td>
                                    {actionType !== 'cancelled' && (
                                        <td className="px-3 py-2 font-mono text-[10px] font-bold text-[var(--primary-color)]">
                                            {getOrderNumber(order)}
                                        </td>
                                    )}
                                    <td className="px-3 py-2 max-w-[130px] truncate text-gray-700 text-[11px]" title={order.objectData.organizationName}>{order.objectData.organizationName}</td>
                                    <td className="px-3 py-2 text-[10px] text-gray-500">{order.objectData.region}, {order.objectData.district}</td>
                                    <td className="px-3 py-2 text-[10px] text-gray-500">{order.objectData.startDate} -<br/>{order.objectData.endDate}</td>
                                    {actionType === 'settled' && (
                                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                            {order.objectData.isUploading ? (
                                                <span className="text-[var(--primary-color)] flex items-center justify-center gap-1 font-semibold text-xs">
                                                    <div className="icon-loader animate-spin"></div> Uploading...
                                                </span>
                                            ) : order.objectData.reportPdfUrl ? (
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={() => {
                                                        try {
                                                            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                                                            if (isMobile) {
                                                                const parts = order.objectData.reportPdfUrl.split(';base64,');
                                                                const contentType = parts[0].split(':')[1];
                                                                const raw = window.atob(parts[1]);
                                                                const rawLength = raw.length;
                                                                const uInt8Array = new Uint8Array(rawLength);
                                                                for (let j = 0; j < rawLength; ++j) {
                                                                    uInt8Array[j] = raw.charCodeAt(j);
                                                                }
                                                                const blob = new Blob([uInt8Array], { type: contentType });
                                                                const blobUrl = URL.createObjectURL(blob);
                                                                window.open(blobUrl, '_blank');
                                                            } else {
                                                                const pdfWindow = window.open("");
                                                                pdfWindow.document.write(`<iframe width='100%' height='100%' style='border:none;margin:0;padding:0;' src='${order.objectData.reportPdfUrl}'></iframe>`);
                                                            }
                                                        } catch (e) {
                                                            console.error("PDF Preview error", e);
                                                            const pdfWindow = window.open("");
                                                            pdfWindow.document.write(`<iframe width='100%' height='100%' style='border:none;margin:0;padding:0;' src='${order.objectData.reportPdfUrl}'></iframe>`);
                                                        }
                                                    }} className="bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 px-2 py-1 rounded text-[10px] font-bold transition-colors shadow-sm">
                                                        PREVIEW
                                                    </button>
                                                    <button onClick={() => handleUploadReport(order)} className="bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200 px-2 py-1 rounded text-[10px] font-bold transition-colors shadow-sm">
                                                        CHANGE
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={() => handleUploadReport(order)} className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-[10px] font-bold shadow-sm transition-colors">
                                                    UPLOAD
                                                </button>
                                            )}
                                        </td>
                                    )}
                                    {actionType === 'cancelled' && (
                                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                            <button onClick={() => handleRestoreOrder(order)} className="bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 px-2 py-1 rounded text-[10px] font-bold transition-colors shadow-sm inline-flex items-center gap-1">
                                                <div className="icon-refresh-cw"></div> RESTORE
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 flex font-sans" data-name="admin-dashboard" data-file="components/AdminDashboard.js">
            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>
            )}

            <aside className={`fixed md:relative top-0 left-0 h-[100dvh] w-64 md:w-56 bg-[#0B132B] text-gray-300 flex flex-col shrink-0 shadow-2xl z-50 transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
                <div className="p-4 border-b border-gray-800/50 flex flex-col items-center gap-2 relative">
                    <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden absolute top-4 right-4 text-gray-400 hover:text-white p-1 bg-white/10 rounded-md">
                        <div className="icon-x text-lg"></div>
                    </button>
                    <div className="w-12 h-12 bg-white rounded-xl p-1 shadow-lg">
                        <img src="https://app.trickle.so/storage/public/images/usr_22ca06cc30000001/922907fd-f615-4a33-aabb-ac586c8b6c4f.png" alt="Logo" className="w-full h-full object-contain" />
                    </div>
                    <span className="font-extrabold text-white tracking-wide text-sm">HashREPORTS</span>
                </div>
                <nav className="flex-1 py-1 overflow-y-auto space-y-0 px-2">
                    {navItems.map(item => (
                        <button 
                            key={item}
                            onClick={() => { setActiveTab(item); setIsMobileMenuOpen(false); }}
                            className={`w-full text-left px-3 py-1.5 rounded-lg transition-all duration-200 text-[12px] font-medium ${activeTab === item ? 'bg-[var(--primary-color)] text-white shadow-sm shadow-blue-500/20' : 'hover:bg-gray-800 hover:text-white'}`}
                        >
                            {item}
                        </button>
                    ))}
                </nav>
                <div className="p-3 border-t border-gray-800/50 mt-auto shrink-0">
                    <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors py-2 rounded-lg font-bold text-xs">
                        <div className="icon-log-out text-sm"></div> SIGN OUT
                    </button>
                </div>
            </aside>

            <main className="flex-1 flex flex-col h-screen overflow-hidden relative bg-gray-50">
                {/* Top Header */}
                <header className="bg-white shadow-sm px-4 md:px-6 py-2.5 flex justify-between items-center z-30 shrink-0 border-b border-gray-100">
                    <div className="flex items-center md:hidden gap-3">
                        <button onClick={() => setIsMobileMenuOpen(true)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 transition-colors">
                            <div className="icon-menu text-2xl"></div>
                        </button>
                        <img src="https://app.trickle.so/storage/public/images/usr_22ca06cc30000001/922907fd-f615-4a33-aabb-ac586c8b6c4f.png" alt="Logo" className="h-7 object-contain" />
                    </div>
                    <div className="hidden md:block">
                        <h2 className="text-gray-400 font-medium text-sm">Welcome back to the portal</h2>
                    </div>
                    
                    <div className="flex items-center justify-end">
                        <div className="flex items-center gap-2 md:gap-3">
                            <div className="text-right flex flex-col justify-center">
                                {adminAuthority === 'Chief Executive Officer' ? (
                                    <>
                                        <p className="text-[12px] md:text-sm font-bold text-gray-900 leading-tight whitespace-normal md:whitespace-nowrap">Hashimu Shabani Halifa</p>
                                        <p className="text-[9px] md:text-[10px] font-bold text-[var(--primary-color)] uppercase">{adminAuthority}</p>
                                    </>
                                ) : (
                                    <p className="text-xs md:text-lg font-black text-[var(--primary-color)] uppercase tracking-wide mt-0.5">{adminAuthority}</p>
                                )}
                            </div>
                            <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-[var(--primary-color)] overflow-hidden shadow-sm shrink-0 ${adminAuthority !== 'Chief Executive Officer' ? 'bg-white p-1' : ''}`}>
                                <img 
                                    src={adminAuthority === 'Chief Executive Officer' 
                                        ? "https://app.trickle.so/storage/public/images/usr_1879f92188000001/ef455b7a-fb02-4f25-941b-6d9d83f6fcb7.jpeg" 
                                        : "https://app.trickle.so/storage/public/images/usr_22ca06cc30000001/922907fd-f615-4a33-aabb-ac586c8b6c4f.png"} 
                                    alt="Profile" 
                                    className={`w-full h-full ${adminAuthority === 'Chief Executive Officer' ? 'object-cover' : 'object-contain'}`} 
                                />
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex-1 flex flex-col overflow-hidden relative">
                    
                    {activeTab === 'Dashboard' && (() => {
                        const activeFieldOrders = fieldOrders.filter(order => {
                            const u = users.find(user => user.objectData.regNumber === order.objectData.regNumber);
                            return u && !u.objectData.deleted;
                        });
                        return (
                        <div className="h-full overflow-y-auto edge-scrollbar w-full px-4 md:px-8 py-4 md:py-8 absolute inset-0">
                            <div className="max-w-7xl mx-auto space-y-4 pb-10">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[
                                    { label: 'Total Users', val: users.filter(u => !u.objectData.deleted).length.toString(), icon: 'users', color: 'blue' },
                                    { label: 'Pending Orders', val: activeFieldOrders.filter(o => o.objectData.status === 'PAID' && !o.objectData.settled).length.toString(), icon: 'clock', color: 'orange' },
                                    { label: 'Settled Reports', val: activeFieldOrders.filter(o => o.objectData.settled).length.toString(), icon: 'circle-check', color: 'green' },
                                    { label: 'Total Revenue', val: 'TZS ' + (activeFieldOrders.filter(o => o.objectData.status === 'PAID').length * 15000).toLocaleString(), icon: 'banknote', color: 'emerald' }
                                ].map((stat, i) => (
                                    <div key={i} className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex flex-col hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className={`w-8 h-8 rounded-lg bg-${stat.color}-50 flex items-center justify-center text-${stat.color}-500 text-lg`}>
                                                <div className={`icon-${stat.icon}`}></div>
                                            </div>
                                            <span className={`text-[9px] font-bold text-${stat.color}-600 bg-${stat.color}-50 px-1.5 py-0.5 rounded`}>All Time</span>
                                        </div>
                                        <p className="text-[10px] text-gray-500 font-medium mb-0.5">{stat.label}</p>
                                        <p className="text-xl font-black text-gray-900 leading-none">{stat.val}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                                    <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                                        <div className="icon-chart-bar text-[var(--primary-color)] text-sm"></div> Orders Overview
                                    </h3>
                                    <div className="h-44 w-full relative">
                                        <canvas ref={chartRef}></canvas>
                                    </div>
                                </div>
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                                    <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                                        <div className="icon-chart-pie text-orange-500 text-sm"></div> Order Status
                                    </h3>
                                    <div className="h-32 w-full relative flex items-center justify-center">
                                        <canvas ref={doughnutRef}></canvas>
                                    </div>
                                    <div className="flex flex-wrap justify-center gap-2 mt-3 text-[9px] font-medium text-gray-600">
                                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span>Pending</div>
                                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span>Settled</div>
                                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span>Unpaid</div>
                                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500"></span>Cancelled</div>
                                    </div>
                                </div>
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                                    <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                                        <div className="icon-chart-pie text-purple-500 text-sm"></div> Order Types
                                    </h3>
                                    <div className="h-32 w-full relative flex items-center justify-center">
                                        <canvas ref={typeChartRef}></canvas>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pb-4">
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                                    <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                                        <div className="icon-chart-line text-emerald-500 text-sm"></div> Revenue Growth
                                    </h3>
                                    <div className="h-44 w-full relative">
                                        <canvas ref={revenueChartRef}></canvas>
                                    </div>
                                </div>
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                                    <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                                        <div className="icon-map-pin text-indigo-500 text-sm"></div> Orders by Region
                                    </h3>
                                    <div className="h-44 w-full relative">
                                        <canvas ref={regionChartRef}></canvas>
                                    </div>
                                </div>
                                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                                    <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                                        <div className="icon-activity text-pink-500 text-sm"></div> User Activity
                                    </h3>
                                    <div className="h-44 w-full relative">
                                        <canvas ref={activityChartRef}></canvas>
                                    </div>
                                </div>
                            </div>
                        </div>
                        </div>
                    )})()}

                    {activeTab === 'Registered Users' && (
                        <div className="absolute inset-0 flex flex-col w-full h-full px-4 md:px-8 py-4 md:py-8 overflow-hidden">
                            <div className="max-w-7xl w-full mx-auto relative flex flex-col h-full">
                                {renderSearchHeader("Registered Users")}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col mt-4 flex-1 min-h-0">
                                    <div className="flex-1 overflow-auto edge-scrollbar">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-gray-100 text-gray-700 font-semibold uppercase text-[9px] tracking-wider sticky top-0 z-10 shadow-[0_1px_0_rgba(229,231,235,1)]">
                                            <tr>
                                                <th className="px-3 py-2 bg-gray-100">Profile</th>
                                                <th className="px-3 py-2 bg-gray-100">Full Name</th>
                                                <th className="px-3 py-2 bg-gray-100">Reg Number</th>
                                                <th className="px-3 py-2 bg-gray-100">University</th>
                                                <th className="px-3 py-2 bg-gray-100">Course</th>
                                                <th className="px-3 py-2 bg-gray-100">Phones</th>
                                                <th className="px-3 py-2 bg-gray-100">Email</th>
                                                <th className="px-3 py-2 bg-gray-100">Password</th>
                                                <th className="px-3 py-2 text-center bg-gray-100">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {applySearch(users.filter(u => !u.objectData.deleted), u => [u.objectData.fullName, u.objectData.regNumber, u.objectData.email]).length === 0 ? (
                                                <tr>
                                                    <td colSpan="9" className="px-3 py-8 text-center text-gray-500">
                                                        <div className="flex flex-col items-center gap-2">
                                                            <div className="icon-search text-3xl opacity-20"></div>
                                                            <span>No users found.</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                applySearch(users.filter(u => !u.objectData.deleted), u => [u.objectData.fullName, u.objectData.regNumber, u.objectData.email]).map((u, i) => (
                                                    <tr key={i} className="hover:bg-blue-50/50 transition-colors cursor-pointer" onClick={() => setSelectedUserForDetails(u)}>
                                                        <td className="px-3 py-2">
                                                            <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 shadow-sm bg-gray-100">
                                                                {u.objectData.photoUrl ? <img src={u.objectData.photoUrl} alt="profile" className="w-full h-full object-cover" /> : <div className="icon-user text-gray-400 w-full h-full flex items-center justify-center"></div>}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2 font-medium text-[11px] text-gray-900">{u.objectData.fullName}</td>
                                                        <td className="px-3 py-2 font-mono text-[10px] text-gray-600">{u.objectData.regNumber}</td>
                                                        <td className="px-3 py-2 text-[10px] text-gray-700 truncate max-w-[100px]">{u.objectData.university}</td>
                                                        <td className="px-3 py-2 text-gray-600 text-[10px] truncate max-w-[100px]">{u.objectData.course || 'N/A'}</td>
                                                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                                            <div className="flex flex-col gap-0.5 font-mono text-[10px]">
                                                                <span className="text-blue-600"><span className="text-gray-400 mr-1 font-sans">N:</span>{u.objectData.normalPhone}</span>
                                                                <a href={`https://wa.me/${u.objectData.whatsappNumber?.replace('+', '')}`} target="_blank" className="text-green-600 hover:text-green-700 flex items-center gap-1 underline decoration-green-300 decoration-dotted underline-offset-2 w-max">
                                                                    <span className="text-gray-400 font-sans">W:</span>{u.objectData.whatsappNumber}
                                                                </a>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-600 text-[10px]">{u.objectData.email}</td>
                                                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px] border border-gray-200">
                                                                    {visiblePasswords[u.objectData.regNumber] ? u.objectData.password : '••••••••'}
                                                                </span>
                                                                <button onClick={() => togglePasswordVisibility(u.objectData.regNumber)} className="text-gray-400 hover:text-[var(--primary-color)] transition-colors bg-white p-1 rounded shadow-sm border border-gray-200">
                                                                    <div className={`icon-${visiblePasswords[u.objectData.regNumber] ? 'eye-off' : 'eye'} text-[10px]`}></div>
                                                                </button>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                                            <button onClick={() => confirmDelete(u)} className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors border border-transparent hover:border-red-200" title="Delete User">
                                                                <div className="icon-trash"></div>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Deleted Users' && (
                        <div className="absolute inset-0 flex flex-col w-full h-full px-4 md:px-8 py-4 md:py-8 overflow-hidden">
                            <div className="max-w-7xl w-full mx-auto relative flex flex-col h-full">
                                {renderSearchHeader("Deleted Users")}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col mt-4 flex-1 min-h-0">
                                    <div className="flex-1 overflow-auto edge-scrollbar">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-gray-100 text-gray-700 font-semibold uppercase text-[9px] tracking-wider sticky top-0 z-10 shadow-[0_1px_0_rgba(229,231,235,1)]">
                                            <tr>
                                                <th className="px-3 py-2 bg-gray-100">Profile</th>
                                                <th className="px-3 py-2 bg-gray-100">Full Name</th>
                                                <th className="px-3 py-2 bg-gray-100">Reg Number</th>
                                                <th className="px-3 py-2 bg-gray-100">Email</th>
                                                <th className="px-3 py-2 text-center bg-gray-100">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {applySearch(users.filter(u => u.objectData.deleted), u => [u.objectData.fullName, u.objectData.regNumber]).length === 0 ? (
                                                <tr>
                                                    <td colSpan="5" className="px-3 py-8 text-center text-gray-500">No deleted users found.</td>
                                                </tr>
                                            ) : (
                                                applySearch(users.filter(u => u.objectData.deleted), u => [u.objectData.fullName, u.objectData.regNumber]).map((u, i) => (
                                                    <tr key={i} className="hover:bg-gray-50 transition-colors bg-red-50/10">
                                                        <td className="px-3 py-2">
                                                            <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 shadow-sm bg-gray-100">
                                                                {u.objectData.photoUrl ? <img src={u.objectData.photoUrl} alt="profile" className="w-full h-full object-cover grayscale opacity-60" /> : <div className="icon-user text-gray-400 w-full h-full flex items-center justify-center"></div>}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2 font-medium text-[11px] text-gray-500 line-through">{u.objectData.fullName}</td>
                                                        <td className="px-3 py-2 text-gray-400 font-mono text-[10px]">{u.objectData.regNumber}</td>
                                                        <td className="px-3 py-2 text-gray-400 text-[10px]">{u.objectData.email}</td>
                                                        <td className="px-3 py-2 text-center">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <button onClick={() => handleRestoreUser(u)} className="bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 px-2 py-1 rounded text-[10px] font-bold transition-colors shadow-sm inline-flex items-center gap-1">
                                                                    <div className="icon-refresh-cw"></div> RESTORE
                                                                </button>
                                                                <button onClick={() => setConfirmDialog({
                                                                    title: "Permanent Delete",
                                                                    message: "Are you sure you want to permanently delete this user? This action cannot be undone.",
                                                                    icon: "trash",
                                                                    confirmButtonClass: "btn-primary !bg-red-600 !hover:bg-red-700 !border-none text-white",
                                                                    onConfirm: async () => {
                                                                        try {
                                                                            const regNumber = u.objectData.regNumber;
                                                                            const ordersToDelete = fieldOrders.filter(o => o.objectData.regNumber === regNumber);
                                                                            for (const o of ordersToDelete) await dbDeleteObject('field_report_order', o.objectId);
                                                                            
                                                                            const logsToDelete = logbooks.filter(l => l.objectData.regNumber === regNumber);
                                                                            for (const l of logsToDelete) await dbDeleteObject('logbook', l.objectId);
                                                                            
                                                                            const reqsToDelete = passwordRequests.filter(r => r.objectData.regNumber === regNumber);
                                                                            for (const r of reqsToDelete) await dbDeleteObject('password_request', r.objectId);
                                                                            
                                                                            const notifRes = await dbListObjects('notification', 1000, false);
                                                                            const notifsToDelete = notifRes.items.filter(n => n.objectData.regNumber === regNumber);
                                                                            for (const n of notifsToDelete) await dbDeleteObject('notification', n.objectId);
                                                                            
                                                                            await dbDeleteObject('user', u.objectId);
                                                                            
                                                                            setUsers(users.filter(usr => usr.objectId !== u.objectId));
                                                                            setFieldOrders(fieldOrders.filter(o => o.objectData.regNumber !== regNumber));
                                                                            setLogbooks(logbooks.filter(l => l.objectData.regNumber !== regNumber));
                                                                            setPasswordRequests(passwordRequests.filter(r => r.objectData.regNumber !== regNumber));
                                                                        } catch(e) { console.error(e); }
                                                                        setConfirmDialog(null);
                                                                    }
                                                                })} className="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-2 py-1 rounded text-[10px] font-bold transition-colors shadow-sm inline-flex items-center gap-1">
                                                                    <div className="icon-trash"></div> DELETE
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {activeTab === 'Password Requests' && (
                        <div className="absolute inset-0 flex flex-col w-full h-full px-4 md:px-8 py-4 md:py-8 overflow-hidden">
                            <div className="max-w-7xl w-full mx-auto relative flex flex-col h-full">
                                {renderSearchHeader("Password Requests")}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col mt-4 flex-1 min-h-0">
                                    <div className="flex-1 overflow-auto edge-scrollbar">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-gray-100 text-gray-700 font-semibold uppercase text-[9px] tracking-wider sticky top-0 z-10 shadow-[0_1px_0_rgba(229,231,235,1)]">
                                            <tr>
                                                <th className="px-3 py-2 bg-gray-100">Reg Number</th>
                                                <th className="px-3 py-2 bg-gray-100">Status</th>
                                                <th className="px-3 py-2 bg-gray-100">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {applySearch(passwordRequests.filter(r => {
                                                const u = users.find(user => user.objectData.regNumber === r.objectData.regNumber);
                                                return u && !u.objectData.deleted;
                                            }), r => [r.objectData.regNumber]).length === 0 ? (
                                                <tr><td colSpan="3" className="px-3 py-8 text-center text-gray-500">No requests found.</td></tr>
                                            ) : (
                                                applySearch(passwordRequests.filter(r => {
                                                    const u = users.find(user => user.objectData.regNumber === r.objectData.regNumber);
                                                    return u && !u.objectData.deleted;
                                                }), r => [r.objectData.regNumber]).map((req, i) => (
                                                    <tr key={i} className="hover:bg-blue-50/50">
                                                        <td className="px-3 py-2 font-mono text-[11px] text-gray-900">{req.objectData.regNumber}</td>
                                                        <td className="px-3 py-2">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${req.objectData.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                                                {req.objectData.status.toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            {req.objectData.status === 'pending' && (
                                                                <button disabled={processingRequests[req.objectId]} onClick={() => handleApproveRequest(req)} className="bg-[var(--primary-color)] text-white px-2 py-1 rounded text-[10px] font-bold hover:bg-[var(--primary-dark)] shadow-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-1 w-max">
                                                                    {processingRequests[req.objectId] ? <div className="icon-loader animate-spin text-[10px]"></div> : null}
                                                                    APPROVE
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Field Report Orders' && (
                        <div className="absolute inset-0 flex flex-col w-full h-full px-4 md:px-8 py-4 md:py-8 overflow-hidden">
                            <div className="max-w-7xl w-full mx-auto relative flex flex-col h-full">
                                {renderSearchHeader("All Field Report Orders")}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col mt-4 flex-1 min-h-0">
                                    <div className="flex-1 overflow-auto edge-scrollbar">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-gray-100 text-gray-700 font-semibold border-b border-gray-200 uppercase text-[9px] tracking-wider">
                                            <tr>
                                                <th className="px-3 py-2">Profile</th>
                                                <th className="px-3 py-2">Name</th>
                                                <th className="px-3 py-2">Reg Number</th>
                                                <th className="px-3 py-2">Organization</th>
                                                <th className="px-3 py-2">Location</th>
                                                <th className="px-3 py-2">Duration</th>
                                                <th className="px-3 py-2">Payment Info</th>
                                                <th className="px-3 py-2 text-center">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {applySearch(getOrdersWithUserDetails(o => o.objectData.status !== 'CANCELLED'), o => [o.userDetails.objectData?.fullName, o.objectData.regNumber, o.objectData.organizationName, o.objectData.paymentPhone, o.objectData.paymentName]).length === 0 ? (
                                                <tr>
                                                    <td colSpan="8" className="px-3 py-8 text-center text-gray-500">No field report orders at the moment.</td>
                                                </tr>
                                            ) : (
                                                applySearch(getOrdersWithUserDetails(o => o.objectData.status !== 'CANCELLED'), o => [o.userDetails.objectData?.fullName, o.objectData.regNumber, o.objectData.organizationName, o.objectData.paymentPhone, o.objectData.paymentName]).map((order, i) => (
                                                    <tr key={i} className="hover:bg-blue-50/50 transition-colors cursor-pointer" onClick={() => setSelectedFieldOrderForDetails(order)}>
                                                        <td className="px-3 py-2">
                                                            <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 shadow-sm bg-gray-100">
                                                                {order.userDetails.objectData?.photoUrl ? <img src={order.userDetails.objectData.photoUrl} alt="profile" className="w-full h-full object-cover" /> : <div className="icon-user text-gray-400 w-full h-full flex items-center justify-center"></div>}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2 font-medium text-[11px] text-gray-900">{order.userDetails.objectData?.fullName || 'Unknown'}</td>
                                                        <td className="px-3 py-2 font-mono text-[10px] text-gray-600">{order.objectData.regNumber}</td>
                                                        <td className="px-3 py-2 max-w-[130px] truncate text-gray-700 text-[11px]" title={order.objectData.organizationName}>{order.objectData.organizationName}</td>
                                                        <td className="px-3 py-2 text-[10px] text-gray-500">{order.objectData.region}, {order.objectData.district}</td>
                                                        <td className="px-3 py-2 text-[10px] text-gray-500">{order.objectData.startDate} -<br/>{order.objectData.endDate}</td>
                                                        <td className="px-3 py-2">
                                                            <div className="flex flex-col bg-gray-50 p-1.5 rounded border border-gray-200">
                                                                <span className="text-[10px] font-mono font-bold text-gray-800">{order.objectData.paymentPhone}</span>
                                                                <span className="text-[9px] text-gray-500 truncate max-w-[100px]">{order.objectData.paymentName}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                                            <div className="flex items-center justify-center gap-2">
                                                                <button 
                                                                    onClick={() => handleToggleOrderStatus(order)}
                                                                    className={`text-[9px] font-bold px-2 py-1 rounded border transition-colors shadow-sm ${order.objectData.status === 'PAID' ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'}`}
                                                                >
                                                                    {order.objectData.status}
                                                                </button>
                                                                <button onClick={() => handleDeleteOrder(order.objectId)} className="text-red-500 hover:bg-red-50 p-1 rounded border border-transparent hover:border-red-200 transition-colors" title="Delete Order">
                                                                    <div className="icon-trash"></div>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Logbooks' && (
                        <div className="absolute inset-0 flex flex-col w-full h-full px-4 md:px-8 py-4 md:py-8 overflow-hidden">
                            <div className="max-w-7xl w-full mx-auto relative flex flex-col h-full">
                                {renderSearchHeader("Logbooks")}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col mt-4 flex-1 min-h-0">
                                    <div className="flex-1 overflow-auto edge-scrollbar pb-4">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-gray-100 text-gray-700 font-semibold uppercase text-[9px] tracking-wider sticky top-0 z-10 shadow-[0_1px_0_rgba(229,231,235,1)]">
                                            <tr>
                                                <th className="px-3 py-2 bg-gray-100">Profile</th>
                                                <th className="px-3 py-2 bg-gray-100">Name</th>
                                                <th className="px-3 py-2 bg-gray-100">Reg Number</th>
                                                <th className="px-3 py-2 bg-gray-100">Order No</th>
                                                {["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6"].map(w => (
                                                    <th key={w} className="px-2 py-2 text-center border-l border-gray-200 bg-gray-100">{w}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {applySearch(getOrdersWithUserDetails(o => o.objectData.status !== 'CANCELLED'), o => [o.userDetails.objectData?.fullName, o.objectData.regNumber]).length === 0 ? (
                                                <tr>
                                                    <td colSpan="10" className="px-3 py-8 text-center text-gray-500">No field orders available.</td>
                                                </tr>
                                            ) : (
                                                applySearch(getOrdersWithUserDetails(o => o.objectData.status !== 'CANCELLED'), o => [o.userDetails.objectData?.fullName, o.objectData.regNumber]).map((order, i) => {
                                                    const orderLogbooks = logbooks.filter(l => l.objectData.orderId === order.objectId);
                                                    
                                                    return (
                                                        <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                                                            <td className="px-3 py-2">
                                                                <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 shadow-sm bg-gray-100">
                                                                    {order.userDetails.objectData?.photoUrl ? <img src={order.userDetails.objectData.photoUrl} alt="profile" className="w-full h-full object-cover" /> : <div className="icon-user text-gray-400 w-full h-full flex items-center justify-center"></div>}
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2 font-medium text-[11px] text-gray-900">{order.userDetails.objectData?.fullName || 'Unknown'}</td>
                                                            <td className="px-3 py-2 font-mono text-[10px] text-gray-600">{order.objectData.regNumber}</td>
                                                            <td className="px-3 py-2 font-mono text-[10px] font-bold text-[var(--primary-color)]">
                                                                {order.objectData.status === 'PAID' ? getOrderNumber(order) : <span className="text-gray-400 font-normal italic">UNPAID</span>}
                                                            </td>
                                                            
                                                            {["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6"].map(w => {
                                                                const log = orderLogbooks.find(l => l.objectData.week === w);
                                                                
                                                                return (
                                                                    <td key={w} className="px-2 py-2 border-l border-gray-100 text-center min-w-[130px]">
                                                                        {!log ? (
                                                                            <span className="text-[10px] text-gray-400 font-medium">Pending</span>
                                                                        ) : (
                                                                            <div className="flex flex-col items-center gap-1.5">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <button 
                                                                                        onClick={() => { if (checkAuth('viewing')) setViewingLogbook(log.objectData.rawImage); }}
                                                                                        className="bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded text-[9px] font-bold transition-colors shadow-sm"
                                                                                    >
                                                                                        RAW
                                                                                    </button>
                                                                                    
                                                                                    {log.objectData.logbookStatus === 'digitized' ? (
                                                                                        <button 
                                                                                            onClick={() => { if (checkAuth('viewing')) setViewingLogbook(log.objectData.digitizedImage); }}
                                                                                            className="bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 px-2 py-0.5 rounded text-[9px] font-bold transition-colors shadow-sm flex items-center gap-1"
                                                                                        >
                                                                                            <div className="icon-check"></div> DONE
                                                                                        </button>
                                                                                    ) : digitizingState[log.objectId] ? (
                                                                                        <button 
                                                                                            disabled
                                                                                            className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[9px] font-bold shadow-sm flex items-center gap-1"
                                                                                        >
                                                                                            <div className="icon-loader animate-spin text-[10px]"></div> PROC..
                                                                                        </button>
                                                                                    ) : (
                                                                                        <button 
                                                                                            onClick={() => handleDigitizeUpload(log.objectId)}
                                                                                            className="bg-[var(--primary-color)] text-white hover:bg-[var(--primary-dark)] px-2 py-0.5 rounded text-[9px] font-bold transition-colors shadow-sm"
                                                                                        >
                                                                                            DIGITIZE
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Pending Orders' && (
                        <div className="absolute inset-0 flex flex-col w-full h-full px-4 md:px-8 py-4 md:py-8 overflow-hidden">
                            <div className="max-w-7xl w-full mx-auto relative flex flex-col h-full">
                                {renderSearchHeader("Pending Orders (Paid & Unsettled)")}
                                <div className="mt-0 flex-1 min-h-0 flex flex-col">
                                {renderOrdersTable(applySearch(getOrdersWithUserDetails(o => o.objectData.status === 'PAID' && !o.objectData.settled), o => [o.userDetails.objectData?.fullName, o.objectData.regNumber]), null)}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Settled Orders' && (
                        <div className="absolute inset-0 flex flex-col w-full h-full px-4 md:px-8 py-4 md:py-8 overflow-hidden">
                            <div className="max-w-7xl w-full mx-auto relative flex flex-col h-full">
                                {renderSearchHeader("Settled Reports")}
                                <div className="mt-0 flex-1 min-h-0 flex flex-col">
                                {renderOrdersTable(applySearch(getOrdersWithUserDetails(o => o.objectData.settled === true), o => [o.userDetails.objectData?.fullName, o.objectData.regNumber]), 'settled')}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Cancelled Orders' && (
                        <div className="absolute inset-0 flex flex-col w-full h-full px-4 md:px-8 py-4 md:py-8 overflow-hidden">
                            <div className="max-w-7xl w-full mx-auto relative flex flex-col h-full">
                                {renderSearchHeader("Cancelled Orders")}
                                <div className="mt-0 flex-1 min-h-0 flex flex-col">
                                {renderOrdersTable(applySearch(getOrdersWithUserDetails(o => o.objectData.status === 'CANCELLED'), o => [o.userDetails.objectData?.fullName, o.objectData.regNumber]), 'cancelled')}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Supervisors' && (
                        <div className="absolute inset-0 flex flex-col w-full h-full px-4 md:px-8 py-4 md:py-8 overflow-hidden">
                            <div className="max-w-7xl w-full mx-auto relative flex flex-col h-full">
                                {renderSearchHeader("Supervisors")}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col mt-4 flex-1 min-h-0">
                                    <div className="flex-1 overflow-auto edge-scrollbar pb-4">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-gray-100 text-gray-700 font-semibold uppercase text-[9px] tracking-wider sticky top-0 z-10 shadow-[0_1px_0_rgba(229,231,235,1)]">
                                            <tr>
                                                <th className="px-3 py-2 bg-gray-100">Profile Photo</th>
                                                <th className="px-3 py-2 bg-gray-100">Full Name</th>
                                                <th className="px-3 py-2 bg-gray-100">Registration Number</th>
                                                <th className="px-3 py-2 bg-gray-100">Internal FIELD Supervisor</th>
                                                <th className="px-3 py-2 bg-gray-100">External Field Supervisor</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {applySearch(getOrdersWithUserDetails(o => o.objectData.internalSupervisor || o.objectData.externalSupervisor), o => [o.userDetails.objectData?.fullName, o.objectData.regNumber]).length === 0 ? (
                                                <tr>
                                                    <td colSpan="5" className="px-3 py-8 text-center text-gray-500">No supervisors added yet.</td>
                                                </tr>
                                            ) : (
                                                applySearch(getOrdersWithUserDetails(o => o.objectData.internalSupervisor || o.objectData.externalSupervisor), o => [o.userDetails.objectData?.fullName, o.objectData.regNumber]).map((order, i) => {
                                                    let intSup = null;
                                                    let extSup = null;
                                                    try { intSup = order.objectData.internalSupervisor ? JSON.parse(order.objectData.internalSupervisor.replace(/&quot;/g, '"')) : null; } catch(e){}
                                                    try { extSup = order.objectData.externalSupervisor ? JSON.parse(order.objectData.externalSupervisor.replace(/&quot;/g, '"')) : null; } catch(e){}
                                                    
                                                    return (
                                                        <tr key={i} className="hover:bg-blue-50/50 transition-colors cursor-pointer" onClick={() => setSelectedOrderForSupervisors(order)}>
                                                            <td className="px-3 py-2">
                                                                <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 shadow-sm bg-gray-100">
                                                                    {order.userDetails.objectData?.photoUrl ? <img src={order.userDetails.objectData.photoUrl} alt="profile" className="w-full h-full object-cover" /> : <div className="icon-user text-gray-400 w-full h-full flex items-center justify-center"></div>}
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2 font-medium text-[11px] text-gray-900">{order.userDetails.objectData?.fullName || 'Unknown'}</td>
                                                            <td className="px-3 py-2 font-mono text-[10px] text-gray-600">{order.objectData.regNumber}</td>
                                                            <td className={`px-3 py-2 ${order.objectData.internalSupervisorChanged ? 'bg-blue-50' : ''}`} onClick={(e) => e.stopPropagation()}>
                                                                {intSup ? (
                                                                    <div className={`relative flex flex-col p-3 rounded-lg border min-w-[220px] transition-colors ${order.objectData.internalSupervisorChanged ? 'bg-[var(--primary-color)] border-[var(--primary-dark)] shadow-lg' : 'bg-gray-50 border-gray-200'}`}>
                                                                        <span className={`font-bold text-[11px] pr-10 whitespace-normal break-words ${order.objectData.internalSupervisorChanged ? 'text-white' : 'text-gray-900'}`}>{intSup.name}</span>
                                                                        <span className={`text-[10px] font-medium mt-0.5 pr-10 whitespace-normal break-words ${order.objectData.internalSupervisorChanged ? 'text-blue-100' : 'text-gray-500'}`}>{intSup.position}</span>
                                                                        
                                                                        {order.objectData.internalSupervisorChanged && (
                                                                            <button onClick={(e) => { e.stopPropagation(); markSupervisorSeen(order, 'internal'); }} className="absolute bottom-2 right-2 text-[8px] bg-white text-[var(--primary-color)] hover:bg-blue-50 border border-white px-1.5 py-0.5 rounded shadow-sm font-bold transition-colors flex items-center gap-0.5">
                                                                                <div className="icon-check text-[8px]"></div> SEEN
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ) : <span className="text-gray-400 text-[10px] italic bg-gray-50 px-2 py-0.5 rounded">Not Assigned</span>}
                                                            </td>
                                                            <td className={`px-3 py-2 ${order.objectData.externalSupervisorChanged ? 'bg-blue-50' : ''}`} onClick={(e) => e.stopPropagation()}>
                                                                {extSup ? (
                                                                    <div className={`relative flex flex-col p-3 rounded-lg border min-w-[220px] transition-colors ${order.objectData.externalSupervisorChanged ? 'bg-[var(--primary-color)] border-[var(--primary-dark)] shadow-lg' : 'bg-gray-50 border-gray-200'}`}>
                                                                        <span className={`font-bold text-[11px] pr-10 whitespace-normal break-words ${order.objectData.externalSupervisorChanged ? 'text-white' : 'text-gray-900'}`}>{extSup.name}</span>
                                                                        <span className={`text-[10px] font-medium mt-0.5 pr-10 whitespace-normal break-words ${order.objectData.externalSupervisorChanged ? 'text-blue-100' : 'text-gray-500'}`}>{extSup.position}</span>
                                                                        
                                                                        {order.objectData.externalSupervisorChanged && (
                                                                            <button onClick={(e) => { e.stopPropagation(); markSupervisorSeen(order, 'external'); }} className="absolute bottom-2 right-2 text-[8px] bg-white text-[var(--primary-color)] hover:bg-blue-50 border border-white px-1.5 py-0.5 rounded shadow-sm font-bold transition-colors flex items-center gap-0.5">
                                                                                <div className="icon-check text-[8px]"></div> SEEN
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ) : <span className="text-gray-400 text-[10px] italic bg-gray-50 px-2 py-0.5 rounded">Not Assigned</span>}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Tracking Popup for Admin */}
                {trackingOrder && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2 md:p-6">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] md:max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up border border-gray-100">
                            <div className="bg-[#0B132B] p-3 md:p-5 flex justify-between items-center text-white shrink-0 border-b border-gray-800">
                                <div>
                                    <h3 className="font-bold text-base md:text-xl leading-tight">{trackingOrder.objectData.reportType} Tracking</h3>
                                    <p className="text-blue-200 text-[11px] md:text-sm font-medium mt-0.5 md:mt-1">
                                        <span className="md:text-sm text-xs font-bold text-white mr-1">{trackingOrder.userDetails?.objectData?.fullName?.split(' ')[0]}</span>
                                        {trackingOrder.objectData.regNumber} - {trackingOrder.objectData.organizationName}
                                    </p>
                                </div>
                                <button onClick={() => setTrackingOrder(null)} className="text-white hover:text-red-400 bg-white/10 hover:bg-white/20 p-1.5 md:p-2 rounded-full transition-colors border border-white/10">
                                    <div className="icon-x text-lg md:text-xl"></div>
                                </button>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-gray-50">
                                {(() => {
                                    const currentProg = initializeProgress(trackingOrder);
                                    return (
                                        <div className="flex flex-col gap-2.5 md:gap-4 w-full max-w-3xl mx-auto">
                                            {adminDashboardStepsData.map((step, index) => {
                                                const stepStatus = getStepStatus(currentProg, step.title, step.subSteps, trackingOrder.objectId);
                                                const isExpanded = expandedStep === index;
                                                const isPending = stepStatus === 'Pending';
                                                
                                                const statusColorClass = stepStatus === 'Completed' ? 'bg-green-500' : stepStatus === 'In Progress' ? 'bg-yellow-500' : 'bg-red-500';

                                                return (
                                                    <div key={index} id={`admin-step-${index}`} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden transition-all duration-300">
                                                        <div 
                                                            className="flex items-center justify-between p-2.5 md:p-4 cursor-pointer hover:bg-blue-50/50 transition-colors"
                                                            onClick={() => {
                                                                const isNowExpanded = !isExpanded;
                                                                setExpandedStep(isNowExpanded ? index : null);
                                                                if (isNowExpanded) {
                                                                    setTimeout(() => {
                                                                        const el = document.getElementById(`admin-step-${index}`);
                                                                        if (el) {
                                                                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                                        }
                                                                    }, 100);
                                                                }
                                                            }}
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <div className={`w-8 h-8 md:w-10 md:h-10 shrink-0 rounded-full flex items-center justify-center text-white shadow-sm ${statusColorClass}`}>
                                                                    <div className={`icon-${getAdminStepIcon(step.title)} text-base md:text-lg`}></div>
                                                                </div>
                                                                <div>
                                                                    <h4 className="font-bold text-gray-900 text-sm md:text-base leading-tight">{step.title}</h4>
                                                                    <p className="text-[10px] md:text-xs text-gray-500 font-medium">{step.subSteps.length} tasks</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 md:gap-4 shrink-0">
                                                                <span className={`text-[10px] md:text-xs font-bold px-2 py-0.5 md:px-3 md:py-1 rounded-md border ${stepStatus === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' : stepStatus === 'In Progress' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                                                                    {stepStatus}
                                                                </span>
                                                                <div className={`text-gray-400 transition-transform bg-gray-50 p-1 md:p-1.5 rounded-md border border-gray-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                                                    <div className="icon-chevron-down"></div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        
                                                        {isExpanded && (
                                                            <div className="border-t border-gray-100 bg-gray-50 p-2.5 md:p-4 grid gap-2 md:gap-3">
                                                                {step.subSteps.map((sub, sIndex) => {
                                                                    const isLogbook = step.title === "Uploading Logbook";
                                                                    const isSupervisors = step.title === "My Supervisors";
                                                                    const isCompleteReport = step.title === "Uploading Your Complete Report";
                                                                    let isCompleted = false;
                                                                    let inProgress = false;
                                                                    if (isLogbook) {
                                                                        const log = logbooks.find(l => l.objectData.orderId === trackingOrder.objectId && l.objectData.week === sub);
                                                                        isCompleted = log && log.objectData.logbookStatus === 'digitized';
                                                                    } else if (isSupervisors) {
                                                                        if (sub === 'Internal FIELD Supervisor') isCompleted = !!trackingOrder.objectData.internalSupervisor;
                                                                        if (sub === 'External UDOM Supervisor') isCompleted = !!trackingOrder.objectData.externalSupervisor;
                                                                    } else if (isCompleteReport) {
                                                                        isCompleted = !!trackingOrder.objectData.reportPdfUrl;
                                                                        inProgress = trackingOrder.objectData.settled && !isCompleted;
                                                                    } else {
                                                                        isCompleted = currentProg[step.title] && currentProg[step.title][sub];
                                                                    }
                                                                    
                                                                    return (
                                                                        <div key={sIndex} className="flex items-center justify-between bg-white p-2.5 md:p-3.5 rounded-xl border border-gray-200 shadow-sm">
                                                                            <span className="text-[11px] md:text-sm font-semibold text-gray-700 pr-2">
                                                                                {sub === 'Internal FIELD Supervisor' ? 'Internal Supervisor' : sub === 'External UDOM Supervisor' ? 'External Supervisor' : sub}
                                                                            </span>
                                                                            {!isLogbook && !isSupervisors && !isCompleteReport ? (
                                                                                <button 
                                                                                    onClick={() => handleToggleSubStep(trackingOrder, step.title, sub)}
                                                                                    className={`shrink-0 relative w-10 h-5 md:w-14 md:h-7 rounded-full transition-colors duration-300 ease-in-out focus:outline-none border-2 ${isCompleted ? 'bg-green-500 border-green-500' : 'bg-gray-200 border-gray-200'}`}
                                                                                >
                                                                                    <div className={`absolute top-0.5 left-0.5 bg-white w-3 h-3 md:w-5 md:h-5 rounded-full shadow-sm transition-transform duration-300 ease-in-out ${isCompleted ? 'transform translate-x-5 md:translate-x-7' : ''}`}></div>
                                                                                </button>
                                                                            ) : (
                                                                                <span className={`shrink-0 text-[10px] md:text-xs font-bold px-2 py-1 md:px-3 md:py-1.5 rounded-md border ${isCompleted ? 'text-green-700 bg-green-50 border-green-200' : inProgress ? 'text-yellow-700 bg-yellow-50 border-yellow-200' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
                                                                                    {isCompleted ? (isLogbook ? 'Digitized' : 'Completed') : inProgress ? 'In Progress' : 'Pending'}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}

                <Popup 
                    isOpen={!!confirmDialog}
                    title={confirmDialog?.title}
                    message={confirmDialog?.message}
                    icon={confirmDialog?.icon}
                    onConfirm={confirmDialog?.onConfirm}
                    onCancel={() => setConfirmDialog(null)}
                    confirmText="YES, CONFIRM"
                />

                {unmarkDialog && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[160] flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in-up border border-gray-100 p-6 text-center">
                            <div className="text-5xl mb-4 text-red-500">
                                <div className="icon-triangle-alert mx-auto"></div>
                            </div>
                            <h3 className="font-bold text-gray-900 text-lg mb-2">Unmark Task</h3>
                            <p className="text-gray-500 text-sm mb-6">If you unmark this task as completed, it will be moved back to Pending Orders and the uploaded PDF report will be permanently deleted.</p>
                            <div className="flex flex-col gap-3">
                                <button onClick={async () => {
                                    await executeToggleSubStep(unmarkDialog.order, unmarkDialog.stepTitle, unmarkDialog.subStep, unmarkDialog.currentProg, unmarkDialog.isTurningOff);
                                    setUnmarkDialog(null);
                                }} className="w-full bg-red-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-red-700 transition-colors shadow-sm">YES, TURN OFF</button>
                                <button onClick={() => setUnmarkDialog(null)} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-blue-700 transition-colors shadow-sm">NO, DON'T</button>
                            </div>
                        </div>
                    </div>
                )}

                {infoDialog && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in-up border border-gray-100 p-6 text-center">
                            <div className="text-5xl mb-4">{infoDialog.icon}</div>
                            <h3 className="font-bold text-gray-900 text-lg mb-2">{infoDialog.title}</h3>
                            <p className="text-gray-500 text-sm mb-6">{infoDialog.message}</p>
                            <button onClick={() => setInfoDialog(null)} className="w-full bg-[var(--primary-color)] text-white font-bold py-3 px-4 rounded-xl hover:bg-[var(--primary-dark)] transition-colors shadow-sm">OKAY</button>
                        </div>
                    </div>
                )}

                <Popup 
                    isOpen={!!authPopupMsg}
                    title="Access Denied"
                    message={authPopupMsg}
                    icon="🚫"
                    onConfirm={() => setAuthPopupMsg(null)}
                    confirmText="OKAY"
                />

                {/* Field Report Order Details Modal */}
                {selectedFieldOrderForDetails && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                        <div className="bg-white w-full max-w-lg rounded-2xl flex flex-col overflow-hidden animate-fade-in-up shadow-2xl border border-gray-200 max-h-[90vh]">
                            <div className="bg-gradient-to-r from-[var(--primary-dark)] to-[var(--primary-color)] p-6 relative shrink-0">
                                <button onClick={() => setSelectedFieldOrderForDetails(null)} className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/10 hover:bg-black/20 p-1.5 rounded-full transition-colors">
                                    <div className="icon-x text-lg"></div>
                                </button>
                                <div className="flex items-center gap-4">
                                    <div className="w-20 h-20 rounded-full border-4 border-white/20 overflow-hidden bg-white/10 shrink-0">
                                        {selectedFieldOrderForDetails.userDetails.objectData?.photoUrl ? (
                                            <img src={selectedFieldOrderForDetails.userDetails.objectData.photoUrl} alt="profile" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="icon-user text-white text-3xl w-full h-full flex items-center justify-center"></div>
                                        )}
                                    </div>
                                    <div className="text-white min-w-0">
                                        <h3 className="text-xl font-bold truncate">{selectedFieldOrderForDetails.userDetails.objectData?.fullName || 'Unknown'}</h3>
                                        <p className="text-blue-100 font-mono text-sm">{selectedFieldOrderForDetails.objectData.regNumber}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 bg-gray-50 flex-1 overflow-y-auto space-y-4">
                                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Order Info</h4>
                                    <div className="flex justify-between items-start border-b border-gray-50 pb-2">
                                        <span className="text-gray-500 text-sm shrink-0">Organization</span>
                                        <span className="font-semibold text-gray-900 text-sm text-right max-w-[65%]">{selectedFieldOrderForDetails.objectData.organizationName}</span>
                                    </div>
                                    <div className="flex justify-between items-start border-b border-gray-50 pb-2">
                                        <span className="text-gray-500 text-sm shrink-0">Location</span>
                                        <span className="font-semibold text-gray-900 text-sm text-right max-w-[65%]">{selectedFieldOrderForDetails.objectData.region}, {selectedFieldOrderForDetails.objectData.district}</span>
                                    </div>
                                    <div className="flex justify-between items-start">
                                        <span className="text-gray-500 text-sm shrink-0">Duration</span>
                                        <span className="font-semibold text-gray-900 text-sm text-right">{selectedFieldOrderForDetails.objectData.startDate} — {selectedFieldOrderForDetails.objectData.endDate}</span>
                                    </div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Payment Info</h4>
                                    <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                                        <span className="text-gray-500 text-sm">Phone</span>
                                        <span className="font-mono font-semibold text-gray-900 text-sm">{selectedFieldOrderForDetails.objectData.paymentPhone}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-500 text-sm">Name</span>
                                        <span className="font-semibold text-gray-900 text-sm text-right">{selectedFieldOrderForDetails.objectData.paymentName}</span>
                                    </div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
                                    <span className="text-gray-500 text-sm">Order Status</span>
                                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${selectedFieldOrderForDetails.objectData.status === 'PAID' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
                                        {selectedFieldOrderForDetails.objectData.status === 'PAID' ? getOrderNumber(selectedFieldOrderForDetails) : selectedFieldOrderForDetails.objectData.status}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {selectedUserForDetails && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                        <div className="bg-white w-full max-w-lg rounded-2xl flex flex-col overflow-hidden animate-fade-in-up shadow-2xl border border-gray-200">
                            <div className="bg-gradient-to-r from-[var(--primary-dark)] to-[var(--primary-color)] p-6 relative">
                                <button onClick={() => setSelectedUserForDetails(null)} className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/10 hover:bg-black/20 p-1.5 rounded-full transition-colors">
                                    <div className="icon-x text-lg"></div>
                                </button>
                                <div className="flex items-center gap-4">
                                    <div className="w-20 h-20 rounded-full border-4 border-white/20 overflow-hidden bg-white/10 shrink-0">
                                        {selectedUserForDetails.objectData.photoUrl ? (
                                            <img src={selectedUserForDetails.objectData.photoUrl} alt="profile" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="icon-user text-white text-3xl w-full h-full flex items-center justify-center"></div>
                                        )}
                                    </div>
                                    <div className="text-white">
                                        <h3 className="text-xl font-bold">{selectedUserForDetails.objectData.fullName}</h3>
                                        <p className="text-blue-100 font-mono text-sm">{selectedUserForDetails.objectData.regNumber}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 bg-gray-50 flex-1 overflow-y-auto space-y-4">
                                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Academic Info</h4>
                                    <div className="flex justify-between items-start border-b border-gray-50 pb-2">
                                        <span className="text-gray-500 text-sm">University</span>
                                        <span className="font-semibold text-gray-900 text-sm text-right">{selectedUserForDetails.objectData.university}</span>
                                    </div>
                                    <div className="flex justify-between items-start">
                                        <span className="text-gray-500 text-sm">Course</span>
                                        <span className="font-semibold text-gray-900 text-sm text-right max-w-[60%]">{selectedUserForDetails.objectData.course || 'N/A'}</span>
                                    </div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Contact Info</h4>
                                    <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                                        <span className="text-gray-500 text-sm">Email</span>
                                        <a href={`mailto:${selectedUserForDetails.objectData.email}`} className="font-semibold text-blue-600 text-sm hover:underline">{selectedUserForDetails.objectData.email}</a>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                                        <span className="text-gray-500 text-sm">Normal Phone</span>
                                        <a href={`tel:${selectedUserForDetails.objectData.normalPhone}`} className="font-semibold text-gray-900 text-sm">{selectedUserForDetails.objectData.normalPhone}</a>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-500 text-sm">WhatsApp</span>
                                        <a href={`https://wa.me/${selectedUserForDetails.objectData.whatsappNumber?.replace('+', '')}`} target="_blank" className="font-semibold text-green-600 text-sm hover:text-green-700 flex items-center gap-1 bg-green-50 px-2 py-1 rounded-lg transition-colors">
                                            <div className="icon-message-circle text-sm"></div> Message
                                        </a>
                                    </div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
                                    <span className="text-gray-500 text-sm">Account Status</span>
                                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${selectedUserForDetails.objectData.deleted ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                        {selectedUserForDetails.objectData.deleted ? 'DELETED' : 'ACTIVE'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Supervisor Details Modal */}
                {selectedOrderForSupervisors && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                        <div className="bg-white w-full max-w-2xl rounded-2xl flex flex-col overflow-hidden animate-fade-in-up shadow-2xl border border-gray-200">
                            <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-5 relative">
                                <button onClick={() => setSelectedOrderForSupervisors(null)} className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded-full transition-colors">
                                    <div className="icon-x text-lg"></div>
                                </button>
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-full border-2 border-white/20 overflow-hidden bg-white/10 shrink-0">
                                        {selectedOrderForSupervisors.userDetails.objectData?.photoUrl ? (
                                            <img src={selectedOrderForSupervisors.userDetails.objectData.photoUrl} alt="profile" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="icon-user text-white text-2xl w-full h-full flex items-center justify-center"></div>
                                        )}
                                    </div>
                                    <div className="text-white">
                                        <h3 className="text-lg font-bold">{selectedOrderForSupervisors.userDetails.objectData?.fullName}</h3>
                                        <p className="text-gray-300 font-mono text-xs">{selectedOrderForSupervisors.objectData.regNumber}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-5 bg-gray-50 flex-1 overflow-y-auto space-y-4 max-h-[70vh]">
                                {(() => {
                                    let intSup = null;
                                    let extSup = null;
                                    try { intSup = selectedOrderForSupervisors.objectData.internalSupervisor ? JSON.parse(selectedOrderForSupervisors.objectData.internalSupervisor.replace(/&quot;/g, '"')) : null; } catch(e){}
                                    try { extSup = selectedOrderForSupervisors.objectData.externalSupervisor ? JSON.parse(selectedOrderForSupervisors.objectData.externalSupervisor.replace(/&quot;/g, '"')) : null; } catch(e){}

                                    return (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                                <h4 className="text-xs font-bold text-[var(--primary-color)] uppercase tracking-wider mb-3 flex items-center gap-2">
                                                    <div className="icon-user-check"></div> Internal Supervisor
                                                </h4>
                                                {intSup ? (
                                                    <div className="space-y-3">
                                                        <div>
                                                            <span className="text-gray-500 text-[10px] block">Name</span>
                                                            <span className="font-semibold text-gray-900 text-sm whitespace-normal break-words">{intSup.name}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500 text-[10px] block">Position/Role</span>
                                                            <span className="font-medium text-gray-700 text-xs whitespace-normal break-words">{intSup.position}</span>
                                                        </div>
                                                        {intSup.phone && (
                                                            <div>
                                                                <span className="text-gray-500 text-[10px] block">Phone Number</span>
                                                                <a href={`tel:${intSup.phone}`} className="font-medium text-blue-600 text-xs hover:underline">{intSup.phone}</a>
                                                            </div>
                                                        )}
                                                        {intSup.email && (
                                                            <div>
                                                                <span className="text-gray-500 text-[10px] block">Email Address</span>
                                                                <a href={`mailto:${intSup.email}`} className="font-medium text-blue-600 text-xs hover:underline break-words">{intSup.email}</a>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="text-gray-400 text-sm italic py-4 text-center">Not Assigned Yet</div>
                                                )}
                                            </div>

                                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                                <h4 className="text-xs font-bold text-green-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                    <div className="icon-user-check"></div> External Supervisor
                                                </h4>
                                                {extSup ? (
                                                    <div className="space-y-3">
                                                        <div>
                                                            <span className="text-gray-500 text-[10px] block">Name</span>
                                                            <span className="font-semibold text-gray-900 text-sm whitespace-normal break-words">{extSup.name}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500 text-[10px] block">Position/Role</span>
                                                            <span className="font-medium text-gray-700 text-xs whitespace-normal break-words">{extSup.position}</span>
                                                        </div>
                                                        {extSup.phone && (
                                                            <div>
                                                                <span className="text-gray-500 text-[10px] block">Phone Number</span>
                                                                <a href={`tel:${extSup.phone}`} className="font-medium text-blue-600 text-xs hover:underline">{extSup.phone}</a>
                                                            </div>
                                                        )}
                                                        {extSup.email && (
                                                            <div>
                                                                <span className="text-gray-500 text-[10px] block">Email Address</span>
                                                                <a href={`mailto:${extSup.email}`} className="font-medium text-blue-600 text-xs hover:underline break-words">{extSup.email}</a>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="text-gray-400 text-sm italic py-4 text-center">Not Assigned Yet</div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}

                {/* Logbook Viewer Modal */}
                {viewingLogbook && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                        <div className="bg-white w-full max-w-3xl max-h-[85vh] h-fit rounded-2xl flex flex-col overflow-hidden animate-fade-in-up shadow-2xl border border-white/10">
                            <div className="bg-gray-100 p-4 border-b border-gray-200 flex justify-between items-center shrink-0">
                                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                    <div className="icon-image text-[var(--primary-color)]"></div> Logbook Preview
                                </h3>
                                <div className="flex items-center gap-3">
                                    <a 
                                        href={viewingLogbook} 
                                        download="Logbook_Preview.jpg" 
                                        className="bg-[var(--primary-color)] hover:bg-[var(--primary-dark)] text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition-colors"
                                    >
                                        <div className="icon-download text-sm"></div> DOWNLOAD
                                    </a>
                                    <button onClick={() => setViewingLogbook(null)} className="text-gray-500 hover:text-red-500 bg-white p-2 rounded-full shadow-sm border border-gray-200 transition-colors">
                                        <div className="icon-x text-lg"></div>
                                    </button>
                                </div>
                            </div>
                            
                            <div className="flex-1 p-4 bg-gray-800 flex justify-center items-start overflow-auto">
                                <img src={viewingLogbook} alt="Logbook" className="max-w-full h-auto object-contain shadow-2xl rounded-lg" />
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export { AdminDashboard };
export default AdminDashboard;
