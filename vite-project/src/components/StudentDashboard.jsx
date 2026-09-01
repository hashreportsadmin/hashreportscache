import React from 'react';
import { OrderFlow } from './OrderFlow';
import { OrderProgress } from './OrderProgress';
import { Popup, ValidatedInput } from './SharedUI';
import { Welcome } from './Welcome';
import { calculateOrderProgress, dbCreateObject, dbListMinimalByField, dbListObjects, dbListObjectsByField, dbUpdateObject } from '../utils/db';
import { formatPhone } from '../utils/formatters';

// --- Dashboard order/logbook cache ---------------------------------------
// The "Your Order in Progress" percentage bar (and every step status on the
// tracking screen, since it's all derived from this same order data) is
// cached permanently in localStorage per student. That means it renders
// instantly from cache - no waiting on the database - and survives signing
// out or closing the browser, exactly like the Upload Logbook tracker does.
const DASH_ORDERS_CACHE_PREFIX = 'cached_dashboard_orders_';
const DASH_LOGBOOKS_CACHE_PREFIX = 'cached_dashboard_logbooks_';

const readDashCache = (prefix, key) => {
    if (!key) return null;
    try {
        const raw = localStorage.getItem(`${prefix}${key}`);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
};

const writeDashCache = (prefix, key, value) => {
    if (!key) return;
    try {
        localStorage.setItem(`${prefix}${key}`, JSON.stringify(value));
    } catch (e) {}
};

// An order's progress is "final" once its report has been delivered -
// nothing about its percentage or step statuses can change after that
// (mirrors how the Admin and tracking screens already treat reportPdfUrl
// as the completed state).
const isOrderFinal = (order) => !!order?.objectData?.reportPdfUrl;
const areAllOrdersFinal = (orders) => Array.isArray(orders) && orders.length > 0 && orders.every(isOrderFinal);

// Orders/logbooks are only re-synced with the database once per calendar
// week for anything already resolved - specifically on the first login of
// each Saturday. A logbook still pending ("ADMIN IS VERIFYING") is checked
// every time the dashboard opens instead, regardless of day. Every other
// case is served purely from the permanent cache above.
const DASH_SYNC_DATE_PREFIX = 'dashboard_last_sync_';

const readDashLastSyncDate = (key) => {
    if (!key) return null;
    try {
        return localStorage.getItem(`${DASH_SYNC_DATE_PREFIX}${key}`);
    } catch (e) {
        return null;
    }
};

const writeDashLastSyncDate = (key, dateStr) => {
    if (!key) return;
    try {
        localStorage.setItem(`${DASH_SYNC_DATE_PREFIX}${key}`, dateStr);
    } catch (e) {}
};

const StudentDashboard = ({ onLogout }) => {
    const user = JSON.parse(localStorage.getItem('currentUser')) || { fullName: 'Student User' };
    const firstName = user.fullName ? user.fullName.split(' ')[0] : 'Student';
    const [orderFlowKey, setOrderFlowKey] = React.useState(0);
    const [showOrderFlow, setShowOrderFlow] = React.useState(false);
    const [userOrders, setUserOrders] = React.useState(() => readDashCache(DASH_ORDERS_CACHE_PREFIX, user?.regNumber) || []);
    const [isFetching, setIsFetching] = React.useState(() => !readDashCache(DASH_ORDERS_CACHE_PREFIX, user?.regNumber));
    const [viewingOrderId, setViewingOrderId] = React.useState(null);
    const [allPaidOrders, setAllPaidOrders] = React.useState([]);
    const [showPaymentPopup, setShowPaymentPopup] = React.useState(false);
    const [editingPayment, setEditingPayment] = React.useState(false);
    const [editPaymentData, setEditPaymentData] = React.useState({ phone: '', name: '' });
    const [copied, setCopied] = React.useState(false);
    const [logbooks, setLogbooks] = React.useState(() => readDashCache(DASH_LOGBOOKS_CACHE_PREFIX, user?.regNumber) || []);
    const [trackingKey, setTrackingKey] = React.useState(0);

    // New states for screens and popups
    const [showOrdersPopup, setShowOrdersPopup] = React.useState(false);
    const [showSupportPopup, setShowSupportPopup] = React.useState(false);
    const [showNoOrderUploadPopup, setShowNoOrderUploadPopup] = React.useState(false);
    const [showNotificationsScreen, setShowNotificationsScreen] = React.useState(false);
    const [showProfileScreen, setShowProfileScreen] = React.useState(false);

    React.useEffect(() => {
        if (viewingOrderId && (!window.history.state || !window.history.state.inner)) {
            window.history.replaceState({ view: 'student-dashboard', inner: true }, '', '#student-dashboard');
        }
    }, []);
    const [initialTrackingStep, setInitialTrackingStep] = React.useState(null);
    const [notifications, setNotifications] = React.useState([]);
    const [skipAnimations, setSkipAnimations] = React.useState(false);

    React.useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'auto' });
    }, [showNotificationsScreen, showProfileScreen, showOrdersPopup, viewingOrderId]);

    const handleCopy = () => {
        navigator.clipboard.writeText("140576405");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Wraps setUserOrders so every local/optimistic change (cancelling an
    // order, placing a new one, editing payment details, etc.) also updates
    // the permanent cache immediately - not just the background sync.
    const updateUserOrders = (updater) => {
        setUserOrders(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            writeDashCache(DASH_ORDERS_CACHE_PREFIX, user.regNumber, next);
            return next;
        });
    };

    React.useEffect(() => {
        let isMounted = true;

        // Fetches fresh orders + logbooks and merges them in. Orders are
        // replaced wholesale on a real sync (their fields all change
        // together), but logbooks are merged per-week: any week already
        // digitized in the cache stays exactly as cached - permanently -
        // and only still-pending weeks get their latest status applied.
        const fetchOrdersAndLogbooks = async () => {
            try {
                const [myOrdersRes, paidRes] = await Promise.all([
                    dbListObjectsByField('field_report_order', 'regNumber', user.regNumber, 1000, true),
                    dbListMinimalByField('field_report_order', 'status', 'PAID')
                ]);
                if (isMounted) {
                    const myOrders = myOrdersRes.items.filter(o => o.objectData.status !== 'CANCELLED');
                    setAllPaidOrders(paidRes.items);
                    setUserOrders(prev => {
                        if (JSON.stringify(prev) !== JSON.stringify(myOrders)) {
                            writeDashCache(DASH_ORDERS_CACHE_PREFIX, user.regNumber, myOrders);
                            return myOrders;
                        }
                        return prev;
                    });
                    setIsFetching(false);
                }
            } catch (e) {
                console.error("Failed to fetch orders", e);
            }

            try {
                const logsRes = await dbListObjectsByField('logbook', 'regNumber', user.regNumber, 1000, true);
                if (isMounted) {
                    setLogbooks(prevLogs => {
                        const freshById = new Map(logsRes.items.map(l => [l.objectId, l]));
                        const merged = prevLogs.map(prevLog => {
                            const prevDigitized = String(prevLog.objectData.logbookStatus).toLowerCase() === 'digitized';
                            if (prevDigitized) return prevLog;
                            return freshById.get(prevLog.objectId) || prevLog;
                        });
                        // Include any logs not previously known locally (new
                        // uploads made from another device/session).
                        logsRes.items.forEach(l => {
                            if (!merged.some(m => m.objectId === l.objectId)) merged.push(l);
                        });
                        if (JSON.stringify(prevLogs) !== JSON.stringify(merged)) {
                            writeDashCache(DASH_LOGBOOKS_CACHE_PREFIX, user.regNumber, merged);
                            return merged;
                        }
                        return prevLogs;
                    });
                }
            } catch (e) {}

            writeDashLastSyncDate(user.regNumber, new Date().toISOString().slice(0, 10));
        };

        if (!(user && user.regNumber)) return;

        const cachedOrdersRaw = readDashCache(DASH_ORDERS_CACHE_PREFIX, user.regNumber);
        const hasSyncedBefore = cachedOrdersRaw !== null;
        const cachedOrders = cachedOrdersRaw || [];
        const cachedLogs = readDashCache(DASH_LOGBOOKS_CACHE_PREFIX, user.regNumber) || [];

        if (areAllOrdersFinal(cachedOrders)) {
            // Every order is fully finished - nothing can change again, so
            // stay on the permanent cache forever.
            setIsFetching(false);
            return () => { isMounted = false; };
        }

        if (!hasSyncedBefore) {
            // First time ever for this student - nothing cached yet, must
            // fetch so there's something to show.
            fetchOrdersAndLogbooks();
            return () => { isMounted = false; };
        }

        setIsFetching(false);

        const hasPendingLogbook = cachedLogs.some(l => String(l.objectData.logbookStatus).toLowerCase() !== 'digitized');
        if (hasPendingLogbook) {
            // At least one week is still "ADMIN IS VERIFYING" - check it
            // every time the dashboard opens, regardless of the day.
            fetchOrdersAndLogbooks();
        } else {
            // Nothing pending right now - only refresh on the first login
            // of each Saturday; every other day is served purely from
            // cache with no database call at all.
            const todayStr = new Date().toISOString().slice(0, 10);
            const isSaturday = new Date().getDay() === 6;
            if (isSaturday && readDashLastSyncDate(user.regNumber) !== todayStr) {
                fetchOrdersAndLogbooks();
            }
        }

        return () => { isMounted = false; };
    }, [user?.regNumber]);

    // Notifications stay on their own short poll, independent of the
    // orders/logbooks caching schedule above - they're meant to feel live.
    React.useEffect(() => {
        let isMounted = true;
        const fetchNotifications = async () => {
            try {
                const notifRes = await dbListObjectsByField('notification', 'regNumber', user.regNumber, 100, true);
                if (isMounted) {
                    setNotifications(notifRes.items);
                }
            } catch (e) {
                console.error("Failed to fetch notifications", e);
            }
        };

        if (user && user.regNumber) {
            fetchNotifications();
            const intervalId = setInterval(fetchNotifications, 5000);
            return () => {
                isMounted = false;
                clearInterval(intervalId);
            };
        }
    }, [user?.regNumber]);

    const [confirmAction, setConfirmAction] = React.useState(null);
    
    // States for Delete Account with Password
    const [showDeletePopup, setShowDeletePopup] = React.useState(false);
    const [deletePassword, setDeletePassword] = React.useState("");
    const [isDeletingAccount, setIsDeletingAccount] = React.useState(false);

    // States for Change Password
    const [showChangePasswordPopup, setShowChangePasswordPopup] = React.useState(false);
    const [cpCurrentPassword, setCpCurrentPassword] = React.useState("");
    const [cpNewPassword, setCpNewPassword] = React.useState("");
    const [cpConfirmPassword, setCpConfirmPassword] = React.useState("");
    const [isChangingPassword, setIsChangingPassword] = React.useState(false);

    const pushInnerScreenState = () => {
        window.history.pushState({ view: 'student-dashboard', inner: true }, '', '#student-dashboard');
    };

    // Handle back button for inner screens
    React.useEffect(() => {
        const handlePopStateInner = (e) => {
            if (showDeletePopup) setShowDeletePopup(false);
            else if (showChangePasswordPopup) setShowChangePasswordPopup(false);
            else if (showNotificationsScreen) setShowNotificationsScreen(false);
            else if (showProfileScreen) setShowProfileScreen(false);
            else if (showOrdersPopup) setShowOrdersPopup(false);
            else if (showPaymentPopup) setShowPaymentPopup(false);
            else if (viewingOrderId) setViewingOrderId(null);
            else if (showSupportPopup) setShowSupportPopup(false);
            else if (showOrderFlow) setShowOrderFlow(false);
        };
        window.addEventListener('popstate', handlePopStateInner);
        return () => window.removeEventListener('popstate', handlePopStateInner);
    }, [showNotificationsScreen, showProfileScreen, showOrdersPopup, showPaymentPopup, viewingOrderId, showSupportPopup, showOrderFlow, showDeletePopup, showChangePasswordPopup]);


    const handlePlaceNewOrderClick = () => {
        if (userOrders.length > 0) {
            let isExecuting = false;
            setConfirmAction({
                title: "Order In Progress",
                message: "You already have a Field Report Order In Progress. Do you want to Cancel it and Place a New Order?",
                icon: "⚠️",
                confirmText: "CANCEL ORDER",
                cancelText: "NO",
                confirmButtonClass: "btn-primary !bg-red-600 !hover:bg-red-700 !border-none text-white",
                onConfirm: async () => {
                    if (isExecuting) return;
                    isExecuting = true;
                    setConfirmAction(prev => ({ ...prev, confirmText: "CANCELING..." }));
                    try {
                        await dbUpdateObject('field_report_order', userOrders[0].objectId, {
                            ...userOrders[0].objectData,
                            status: 'CANCELLED'
                        });
                        updateUserOrders(prev => prev.filter(o => o.objectId !== userOrders[0].objectId));
                        setOrderFlowKey(prev => prev + 1);
                        pushInnerScreenState();
                        setShowOrderFlow(true);
                    } catch (e) {
                        console.error(e);
                    } finally {
                        setConfirmAction(null);
                    }
                }
            });
        } else {
            pushInnerScreenState();
            setShowOrderFlow(true);
        }
    };

    const handleCancelOrder = (orderId) => {
        let isExecuting = false;
        setConfirmAction({
            title: "Cancel Order",
            message: "Are you sure you want to cancel this order? It will be removed permanently.",
            icon: "🗑️",
            confirmText: "YES, CANCEL",
            cancelText: "DON'T CANCEL",
            cancelButtonClass: "btn-primary !bg-blue-600 !hover:bg-blue-700 !border-none text-white shadow-md",
            confirmButtonClass: "btn-primary !bg-red-600 !hover:bg-red-700 !border-none text-white shadow-md",
            onConfirm: async () => {
                if (isExecuting) return;
                isExecuting = true;
                setConfirmAction(prev => ({ ...prev, confirmText: "CANCELING..." }));
                try {
                    const order = userOrders.find(o => o.objectId === orderId);
                    if (order) {
                        await dbUpdateObject('field_report_order', orderId, {
                            ...order.objectData,
                            status: 'CANCELLED'
                        });
                        await dbCreateObject('notification', {
                            regNumber: user.regNumber,
                            title: 'Order Cancelled',
                            message: `Your order for ${order.objectData.organizationName} has been cancelled successfully.`,
                            isRead: false,
                            icon: 'circle-x'
                        });
                        updateUserOrders(prev => prev.filter(o => o.objectId !== orderId));
                    }
                } catch (e) {
                    console.error(e);
                } finally {
                    setConfirmAction(null);
                }
            }
        });
    };



    const currentOrder = userOrders[0]; // Gets the latest order
    const viewingOrder = userOrders.find(o => o.objectId === viewingOrderId);

    React.useEffect(() => {
        // Clear viewing order if it doesn't exist after fetching completes
        if (!isFetching && viewingOrderId && !viewingOrder) {
            setViewingOrderId(null);
        }
    }, [isFetching, viewingOrderId, viewingOrder]);

    const unreadNotificationsCount = notifications.filter(n => !n.objectData.isRead).length;

    const handleUploadLogbookClick = () => {
        if (currentOrder) {
            pushInnerScreenState();
            setTrackingKey(Date.now());
            setInitialTrackingStep(0);
            setViewingOrderId(currentOrder.objectId);
            setSkipAnimations(true);
        } else {
            setShowNoOrderUploadPopup(true);
            setTimeout(() => setShowNoOrderUploadPopup(false), 4000);
        }
    };

    const handleNotificationClick = async (notif) => {
        if (!notif.objectData.isRead) {
            await dbUpdateObject('notification', notif.objectId, { ...notif.objectData, isRead: true });
            setNotifications(prev => prev.map(n => n.objectId === notif.objectId ? { ...n, objectData: { ...n.objectData, isRead: true } } : n));
        }
        if (notif.objectData.actionStep !== undefined && currentOrder) {
            setShowNotificationsScreen(false);
            setInitialTrackingStep(notif.objectData.actionStep);
            setViewingOrderId(currentOrder.objectId);
        }
    };

    // Mark all as read immediately in UI when leaving notifications screen
    React.useEffect(() => {
        if (!showNotificationsScreen) {
            const unreadNotifs = notifications.filter(n => !n.objectData.isRead);
            if (unreadNotifs.length > 0) {
                setNotifications(prev => prev.map(n => ({ ...n, objectData: { ...n.objectData, isRead: true } })));
                unreadNotifs.forEach(async (notif) => {
                    try {
                        await dbUpdateObject('notification', notif.objectId, { ...notif.objectData, isRead: true });
                    } catch(e) { console.error(e); }
                });
            }
        }
    }, [showNotificationsScreen]);

    const handleOpenNotifications = async () => {
        pushInnerScreenState();
        setShowOrdersPopup(false);
        setShowProfileScreen(false);
        setViewingOrderId(null);
        setShowNotificationsScreen(true);
    };

    const handleDeleteAccount = () => {
        setDeletePassword("");
        pushInnerScreenState();
        setShowDeletePopup(true);
    };

    const confirmDeleteAccount = async () => {
        setIsDeletingAccount(true);
        try {
            const u = await dbListObjects('user', 1000, false);
            const dbUser = u.items.find(item => item.objectData.regNumber === user.regNumber);
            if (dbUser) {
                await dbUpdateObject('user', dbUser.objectId, { ...dbUser.objectData, deleted: true });
            }
            localStorage.removeItem('currentUser');
            onLogout();
        } catch (e) {
            console.error("Failed to delete account", e);
        } finally {
            setIsDeletingAccount(false);
            setShowDeletePopup(false);
        }
    };

    const getProgressInfo = (orderData, orderId) => {
        return calculateOrderProgress(orderData, orderId, logbooks);
    };
    
    const getOrderNumber = (order) => {
        if (order.objectData.status === 'PAID') {
            const index = allPaidOrders.findIndex(o => o.objectId === order.objectId);
            return `HR0801-${String(index + 1).padStart(2, '0')}`;
        }
        return `Order #${order.objectId.substring(order.objectId.length - 6).toUpperCase()}`;
    };

    return (
        <div className={`min-h-screen bg-[#f8f9fc] flex flex-col relative font-sans pb-20 md:pb-0 md:pl-64`} data-name="student-dashboard" data-file="components/StudentDashboard.js">
            
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex fixed top-0 left-0 h-screen w-64 bg-white border-r border-gray-200 flex-col z-50">
                <div className="p-6 flex items-center gap-2 border-b border-gray-100">
                    <div className="bg-[var(--primary-color)] rounded-md w-8 h-8 flex items-center justify-center p-1 shadow-sm">
                        <img src="https://app.trickle.so/storage/public/images/usr_1872e80110000001/881a2151-fcd3-465e-a969-91b300e1ab68.png" alt="HashREPORTS" className="w-full h-full object-contain" />
                    </div>
                    <span className="font-extrabold text-[var(--primary-dark)] text-lg tracking-tight">HashREPORTS</span>
                </div>
                
                <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
                    <button onClick={() => {
                        setShowOrdersPopup(false);
                        setShowNotificationsScreen(false);
                        setShowProfileScreen(false);
                        setViewingOrderId(null);
                    }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-colors ${!showProfileScreen && !showNotificationsScreen && !viewingOrder && !showOrdersPopup ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <div className="icon-house text-xl"></div> Home
                    </button>
                    <button onClick={() => {
                        if(!showOrdersPopup) { pushInnerScreenState(); }
                        setShowOrdersPopup(true);
                        setShowNotificationsScreen(false);
                        setShowProfileScreen(false);
                        setViewingOrderId(null);
                    }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-colors ${showOrdersPopup ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <div className="icon-clipboard-list text-xl"></div> Orders
                    </button>
                    <button onClick={handlePlaceNewOrderClick} className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-bold transition-colors bg-[var(--primary-color)] text-white hover:bg-[var(--primary-dark)] shadow-md mt-6">
                        <div className="icon-plus text-lg"></div> New Order
                    </button>
                    <div className="h-6"></div>
                    <button onClick={() => {
                        if(!showNotificationsScreen) { pushInnerScreenState(); }
                        setShowNotificationsScreen(true);
                        setShowOrdersPopup(false);
                        setShowProfileScreen(false);
                        setViewingOrderId(null);
                    }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-colors relative ${showNotificationsScreen ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <div className="icon-bell text-xl"></div> Notifications
                        {unreadNotificationsCount > 0 && <span className="absolute right-4 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm">{unreadNotificationsCount}</span>}
                    </button>
                    <button onClick={() => {
                        if(!showProfileScreen) { pushInnerScreenState(); }
                        setShowProfileScreen(true);
                        setShowOrdersPopup(false);
                        setShowNotificationsScreen(false);
                        setViewingOrderId(null);
                    }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-colors ${showProfileScreen ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <div className="icon-user text-xl"></div> Profile
                    </button>
                </nav>
                
                <div className="p-4 border-t border-gray-100">
                    <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-colors text-red-500 bg-red-50 hover:bg-red-100 border border-red-100">
                        <div className="icon-log-out text-xl"></div> SIGN OUT
                    </button>
                </div>
            </aside>

            {isFetching && viewingOrderId ? (
                <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-gray-50">
                    <div className="icon-loader animate-spin text-[var(--primary-color)] text-4xl mb-4"></div>
                    <p className="text-gray-500 font-bold text-sm">Loading tracking details...</p>
                </div>
            ) : viewingOrder ? (
                <OrderProgress 
                    key={trackingKey}
                    order={viewingOrder} 
                    user={user} 
                    onBack={() => { window.history.back(); }} 
                    getOrderNumber={getOrderNumber}
                    onPayClick={() => { pushInnerScreenState(); setShowPaymentPopup(true); }}
                    initialExpandedStep={initialTrackingStep}
                    skipAnimations={skipAnimations}
                />
            ) : showNotificationsScreen ? (
                <div className="flex flex-col h-full bg-gray-50 min-h-screen">
                    <div className="bg-[var(--primary-color)] pt-5 pb-4 px-5 flex items-center justify-between sticky top-0 z-20 shadow-md shrink-0">
                        <button onClick={() => window.history.back()} className="text-white hover:bg-white/20 p-1.5 rounded-full transition-colors flex items-center justify-center -ml-1.5">
                            <div className="icon-arrow-left text-xl"></div>
                        </button>
                        <h2 className="text-white font-bold text-lg">Notifications</h2>
                        <div className="bg-white rounded-md w-7 h-7 flex items-center justify-center overflow-hidden p-0.5 shadow-sm">
                            <img src="https://app.trickle.so/storage/public/images/usr_1872e80110000001/881a2151-fcd3-465e-a969-91b300e1ab68.png" alt="HashREPORTS" className="w-full h-full object-contain" />
                        </div>
                    </div>
                    <div className="p-3 space-y-2 flex-1 overflow-y-auto relative z-10">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center pt-20 text-gray-400">
                                <div className="icon-bell text-5xl mb-3 opacity-50"></div>
                                <p>No notifications yet</p>
                            </div>
                        ) : (
                            notifications.map(notif => {
                                const date = new Date(notif.createdAt);
                                const amountMatch = notif.objectData.message.match(/TZS \d+(,\d{3})*/);
                                const amount = amountMatch ? amountMatch[0] : null;
                                const messageText = notif.objectData.message.replace(/TZS \d+(,\d{3})*/, '').trim();

                                return (
                                <div 
                                    key={notif.objectId} 
                                    onClick={() => handleNotificationClick(notif)}
                                    className={`rounded-xl p-3 shadow-sm border relative overflow-hidden ${notif.objectData.isRead ? 'border-gray-100 border-l-4 border-l-gray-300 bg-white opacity-70' : 'border-blue-200 border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50 to-white opacity-100 shadow-blue-100 shadow-md'} flex gap-3 cursor-pointer transition-all duration-300`}
                                >
                                    {!notif.objectData.isRead && (
                                        <div className="absolute top-0 right-0 bg-blue-500 text-white text-[8px] font-bold px-2 py-0.5 rounded-bl-lg shadow-sm flex items-center gap-1 z-10">
                                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></span> NEW
                                        </div>
                                    )}
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${notif.objectData.isRead ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-600'}`}>
                                        <div className={`icon-${notif.objectData.icon || 'bell'} text-sm`}></div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-0.5">
                                            <h4 className={`text-xs pr-10 truncate ${notif.objectData.isRead ? 'font-semibold text-gray-700' : 'font-extrabold text-[var(--primary-dark)]'}`}>{notif.objectData.title}</h4>
                                            <div className="text-[9px] text-gray-400 whitespace-nowrap ml-2 flex flex-col items-end">
                                                <span>{date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>
                                        <p className={`text-[11px] leading-tight line-clamp-2 mb-1 ${notif.objectData.isRead ? 'text-gray-500' : 'text-gray-800'}`}>
                                            {messageText}
                                        </p>
                                        <div className="flex justify-between items-center mt-1 pt-1 border-t border-gray-100/50">
                                            {amount ? (
                                                <span className="text-[10px] font-bold text-green-600">{amount}</span>
                                            ) : <span></span>}
                                            <span className="text-[9px] text-gray-400 font-medium">
                                                {date.toLocaleDateString('en-GB', { weekday: 'short' })}, {date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )})
                        )}
                    </div>
                </div>
            ) : showProfileScreen ? (
                <div className="flex flex-col h-full bg-gray-50 min-h-screen">
                    <div className="bg-[var(--primary-color)] pt-5 pb-6 px-5 rounded-b-3xl shadow-md relative z-10">
                        <div className="flex items-center justify-between mb-4 max-w-2xl mx-auto w-full">
                            <button onClick={() => window.history.back()} className="text-white hover:bg-white/20 p-1.5 rounded-full transition-colors flex items-center justify-center -ml-1.5">
                                <div className="icon-arrow-left text-xl"></div>
                            </button>
                            <div className="flex items-center gap-2">
                                <div className="bg-white rounded-md w-7 h-7 flex items-center justify-center overflow-hidden p-0.5 shadow-sm">
                                    <img src="https://app.trickle.so/storage/public/images/usr_1872e80110000001/881a2151-fcd3-465e-a969-91b300e1ab68.png" alt="HashREPORTS" className="w-full h-full object-contain" />
                                </div>
                                <span className="text-white font-bold text-lg tracking-tight drop-shadow-sm">HashREPORTS</span>
                            </div>
                            <div className="w-8"></div>
                        </div>

                        <div className="flex flex-col items-center justify-center text-center">
                            <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg overflow-hidden bg-gray-100 mb-3">
                                {user.photoUrl ? (
                                    <img src={user.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="icon-user text-5xl text-gray-400 w-full h-full flex items-center justify-center mt-2"></div>
                                )}
                            </div>
                            <h2 className="text-white text-xl font-bold">{user.fullName}</h2>
                            <p className="text-blue-200 text-sm font-medium mt-1">{user.regNumber}</p>
                        </div>
                    </div>

                    <div className="flex-1 px-5 -mt-6 relative z-20 max-w-2xl mx-auto w-full pb-10">
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3 mb-5">
                            <h3 className="font-bold text-gray-900 border-b border-gray-100 pb-1.5 flex items-center gap-2">
                                <div className="icon-graduation-cap text-[var(--primary-color)]"></div> Academic Info
                            </h3>
                            <div className="grid grid-cols-1 gap-2 text-sm">
                                <div className="flex flex-col">
                                    <span className="text-gray-400 text-[11px]">University</span>
                                    <span className="font-semibold text-gray-800">{user.university}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-gray-400 text-[11px]">Course</span>
                                    <span className="font-semibold text-gray-800">{user.course || 'N/A'}</span>
                                </div>
                            </div>

                            <h3 className="font-bold text-gray-900 border-b border-gray-100 pb-1.5 mt-3 pt-1 flex items-center gap-2">
                                <div className="icon-phone text-[var(--primary-color)]"></div> Contact Info
                            </h3>
                            <div className="grid grid-cols-1 gap-2 text-sm">
                                <div className="flex flex-col">
                                    <span className="text-gray-400 text-[11px]">Normal Phone</span>
                                    <span className="font-semibold text-gray-800">{user.normalPhone}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-gray-400 text-[11px]">WhatsApp Number</span>
                                    <span className="font-semibold text-gray-800">{user.whatsappNumber}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-gray-400 text-[11px]">Email Address</span>
                                    <span className="font-semibold text-gray-800">{user.email}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex gap-3">
                                <button onClick={() => {
                                    setCpCurrentPassword("");
                                    setCpNewPassword("");
                                    setCpConfirmPassword("");
                                    pushInnerScreenState();
                                    setShowChangePasswordPopup(true);
                                }} className="flex-1 bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 font-bold py-3 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 text-sm">
                                    <div className="icon-key"></div> CHANGE PASSWORD
                                </button>
                                <button onClick={onLogout} className="flex-1 bg-blue-600 text-white hover:bg-blue-700 font-bold py-3 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2">
                                    <div className="icon-log-out"></div> LOGOUT
                                </button>
                            </div>
                            <button onClick={handleDeleteAccount} className="w-full bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 font-bold py-3 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2">
                                <div className="icon-trash"></div> DELETE ACCOUNT
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <>
            {/* Header & Profile Section (Dark Blue) */}
            <div className="bg-[var(--primary-color)] rounded-b-[2rem] pt-5 pb-10 px-5 relative shadow-md">
                {/* Top Logos */}
                <div className="flex justify-between items-center mb-2 max-w-2xl mx-auto w-full">
                    {/* Left: Logo & Title */}
                    <div className="flex items-center gap-2">
                        <div className="bg-white rounded-md w-7 h-7 flex items-center justify-center overflow-hidden p-0.5 shadow-sm">
                            <img 
                                src="https://app.trickle.so/storage/public/images/usr_1872e80110000001/881a2151-fcd3-465e-a969-91b300e1ab68.png" 
                                alt="HashREPORTS" 
                                className="w-full h-full object-contain" 
                            />
                        </div>
                        <span className="text-white font-bold text-lg tracking-tight drop-shadow-sm">HashREPORTS</span>
                    </div>
                    {/* Right: University Logo */}
                    <div className="bg-white rounded-md w-7 h-7 flex items-center justify-center p-0.5 shadow-sm">
                        <img 
                            src="https://app.trickle.so/storage/public/images/usr_1859567910000001/e442c661-c8dc-40b5-8f6d-2dc2e2497c18.jpeg" 
                            alt="UDOM" 
                            className="w-full h-full object-contain"
                        />
                    </div>
                </div>

                {/* Profile Card */}
                <div onClick={() => { pushInnerScreenState(); setShowProfileScreen(true); }} className="bg-black/20 backdrop-blur-md border border-white/10 border-t-4 border-t-white rounded-[1.25rem] p-3.5 flex items-center justify-between shadow-lg max-w-2xl mx-auto w-full cursor-pointer hover:bg-black/30 transition-colors relative overflow-hidden">
                    <div className="flex items-center gap-3">
                        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/20 flex shrink-0 items-center justify-center overflow-hidden border-[2.5px] border-white shadow-inner">
                            {user.photoUrl ? (
                                <img src={user.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <div className="icon-user text-4xl text-white"></div>
                            )}
                        </div>
                        <div>
                            <p className="text-white/80 text-[10px] mb-0.5">Welcome back,</p>
                            <div className="flex items-center gap-1">
                                <h2 className="text-white font-bold text-sm md:text-lg tracking-wide">{user.fullName || 'Hashimu Shabani'}</h2>
                                <div className="bg-white rounded-full flex items-center justify-center w-[16px] h-[16px] shadow-sm">
                                    <div className="icon-check text-[#3b82f6] text-[12px] font-bold"></div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 bg-white/20 text-white text-[10px] font-medium px-2 py-0.5 rounded-full mt-1.5 w-max border border-white/30 shadow-sm">
                                <div className="icon-id-card text-[10px]"></div> {user.regNumber || 'T00-00-00000'}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col items-center justify-center absolute bottom-2 right-3 sm:relative sm:bottom-auto sm:right-auto sm:pr-2 z-10 opacity-100">
                        <div className="icon-shield-check text-white text-[12px] sm:text-4xl mb-0.5 sm:mb-1 drop-shadow-md"></div>
                        <span className="text-white text-[7px] sm:text-[10px] font-medium text-center leading-tight">Reliable Work,<br/>Trusted Results.</span>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <main className="flex-1 px-5 -mt-6 relative z-10 space-y-4 max-w-2xl mx-auto w-full">
                
                {/* Stats Grid */}
                <div className="grid grid-cols-4 gap-2">
                    {/* My Orders */}
                    <div className="bg-white rounded-xl p-2 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center mb-1">
                            <div className="icon-file-text text-blue-600 text-base"></div>
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 leading-tight mb-0.5">{userOrders.length}</h3>
                        <p className="text-gray-500 text-[9px] leading-tight">My Orders</p>
                    </div>

                    {/* In Progress */}
                    <div className="bg-white rounded-xl p-2 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                        <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center mb-1">
                            <div className="icon-clipboard-list text-green-500 text-base"></div>
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 leading-tight mb-0.5">
                            {userOrders.filter(o => o.objectData.status === 'PAID' && (!o.objectData.settled || !o.objectData.reportPdfUrl)).length}
                        </h3>
                        <p className="text-gray-500 text-[9px] leading-tight">In Progress</p>
                    </div>

                    {/* Completed */}
                    <div className="bg-white rounded-xl p-2 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                        <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center mb-1">
                            <div className="icon-circle-check text-purple-600 text-base"></div>
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 leading-tight mb-0.5">
                            {userOrders.filter(o => o.objectData.settled && !!o.objectData.reportPdfUrl).length}
                        </h3>
                        <p className="text-gray-500 text-[9px] leading-tight">Completed</p>
                    </div>

                    {/* Logo Only */}
                    <div className="flex items-end justify-center p-0 pb-2">
                        <img src="https://app.trickle.so/storage/public/images/usr_22ca06cc30000001/922907fd-f615-4a33-aabb-ac586c8b6c4f.png" alt="HashREPORTS" className="w-20 h-20 md:w-24 md:h-24 object-contain object-bottom drop-shadow-md scale-110 -translate-y-1" />
                    </div>
                </div>

                {/* Quick Actions */}
                <div>
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-base font-bold text-gray-900">Quick Actions</h3>
                    </div>
                    <div className="grid grid-cols-5 gap-2 pb-2">
                        <div className="flex flex-col items-center gap-1.5 w-full">
                            <button onClick={handlePlaceNewOrderClick} disabled={showOrderFlow} className="w-full max-w-[3.5rem] aspect-square bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center text-blue-600 shadow-sm mx-auto active:scale-95 transition-transform disabled:opacity-50">
                                <div className="icon-file-plus text-xl"></div>
                            </button>
                            <span className="text-[9px] text-center text-gray-600 leading-tight">Place New<br/>Order</span>
                        </div>
                        <div className="flex flex-col items-center gap-1.5 w-full">
                            <button onClick={() => { pushInnerScreenState(); setShowOrdersPopup(true); }} className="w-full max-w-[3.5rem] aspect-square bg-purple-50 border border-purple-100 rounded-xl flex items-center justify-center text-purple-600 shadow-sm mx-auto">
                                <div className="icon-file-search text-xl"></div>
                            </button>
                            <span className="text-[9px] text-center text-gray-600 leading-tight">My<br/>Orders</span>
                        </div>
                        <div className="flex flex-col items-center gap-1.5 w-full">
                            <button onClick={handleUploadLogbookClick} className="w-full max-w-[3.5rem] aspect-square bg-green-50 border border-green-100 rounded-xl flex items-center justify-center text-green-600 shadow-sm mx-auto">
                                <div className="icon-upload text-xl"></div>
                            </button>
                            <span className="text-[9px] text-center text-gray-600 leading-tight">Upload<br/>Logbook</span>
                        </div>
                        <div className="flex flex-col items-center gap-1.5 w-full">
                            <button onClick={() => window.open('https://wa.me/255675935788', '_blank')} className="w-full max-w-[3.5rem] aspect-square bg-yellow-50 border border-yellow-100 rounded-xl flex items-center justify-center text-yellow-600 shadow-sm mx-auto">
                                <div className="icon-message-square text-xl"></div>
                            </button>
                            <span className="text-[9px] text-center text-gray-600 leading-tight">Chat with<br/>Writer</span>
                        </div>
                        <div className="flex flex-col items-center gap-1.5 w-full">
                            <button onClick={() => { pushInnerScreenState(); setShowSupportPopup(true); }} className="w-full max-w-[3.5rem] aspect-square bg-red-50 border border-red-100 rounded-xl flex items-center justify-center text-red-500 shadow-sm mx-auto">
                                <div className="icon-headphones text-xl"></div>
                            </button>
                            <span className="text-[9px] text-center text-gray-600 leading-tight">Support<br/>Center</span>
                        </div>
                    </div>
                </div>

                {/* Your Order in Progress */}
                <div>
                    <h3 className="text-base font-bold text-gray-900 mb-2">Your Order in Progress</h3>
                    {isFetching ? (
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex justify-center items-center">
                            <div className="icon-loader animate-spin text-[var(--primary-color)] text-2xl"></div>
                        </div>
                    ) : currentOrder ? (
                        <div 
                            onClick={() => { pushInnerScreenState(); setTrackingKey(Date.now()); setInitialTrackingStep(null); setViewingOrderId(currentOrder.objectId); setSkipAnimations(false); }} 
                            className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
                        >
                            <div className="absolute top-0 left-0 w-1 h-full bg-blue-600 rounded-l-xl group-hover:w-1.5 transition-all"></div>
                            <div className="flex justify-between items-start mb-1.5 pl-1.5">
                                <div className="flex items-center gap-2">
                                    {currentOrder.objectData.status === 'PAID' ? (
                                        <>
                                            <span className="bg-green-100 text-green-700 text-[9px] font-bold px-1.5 py-0.5 rounded">PAID</span>
                                            <span className="text-[9px] font-bold"><span className="text-gray-900">Order No:</span> <span className="text-blue-600">{getOrderNumber(currentOrder)}</span></span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="bg-red-100 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded">UNPAID</span>
                                            <button onClick={(e) => { e.stopPropagation(); pushInnerScreenState(); setShowPaymentPopup(true); }} className="bg-orange-100 text-orange-600 hover:bg-orange-200 transition-colors px-2 py-0.5 rounded text-[9px] font-bold flex items-center shadow-sm">
                                                <div className="icon-wallet mr-1"></div> Click here to pay
                                            </button>
                                        </>
                                    )}
                                </div>
                                <button className="text-blue-600 text-[10px] font-semibold flex items-center bg-blue-50 px-2 py-1 rounded group-hover:bg-blue-100 transition-colors">
                                    View Progress <div className="icon-arrow-right ml-1"></div>
                                </button>
                            </div>
                            <div className="pl-1.5">
                                <h4 className="font-bold text-gray-900 text-xs mb-1 truncate" title={`${currentOrder.objectData.reportType} - ${currentOrder.objectData.organizationName}`}>
                                    {currentOrder.objectData.reportType.toUpperCase()} - {currentOrder.objectData.organizationName.toUpperCase()}
                                </h4>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1.5 text-gray-500 text-[10px]">
                                        <div className="icon-calendar text-[12px]"></div>
                                        <span>Order Date: {new Date(currentOrder.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                    </div>
                                    {currentOrder.objectData.status === 'UNPAID' && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleCancelOrder(currentOrder.objectId); }} 
                                            className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded text-[9px] font-bold transition-colors shadow-sm"
                                        >
                                            CANCEL ORDER
                                        </button>
                                    )}
                                </div>
                                
                                {(() => {
                                    const { pct, color, textColor, status } = getProgressInfo(currentOrder.objectData, currentOrder.objectId);
                                    return (
                                        <div className="flex flex-col gap-1 w-full mt-1">
                                            <div className="flex justify-between items-end">
                                                <span className={`text-[10px] font-bold ${textColor}`}>{status}</span>
                                                <span className="text-[10px] font-bold text-gray-600">{pct}%</span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden flex">
                                                <div className={`${color} h-full rounded-full transition-all duration-500`} style={{ width: `${pct}%` }}></div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                                <div className="icon-file-x text-2xl text-gray-400"></div>
                            </div>
                            <p className="text-gray-600 font-medium text-xs">No Any Placed Order. Please Place a New Order.</p>
                        </div>
                    )}
                </div>

                {/* Promo Banner */}
                <div className="bg-[#0b162c] rounded-2xl p-4 flex items-center justify-between relative overflow-hidden shadow-md mt-2">
                    {/* Background decorations */}
                    <div className="absolute right-0 top-0 w-32 h-32 bg-blue-600/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                    
                    <div className="relative z-10 w-2/3 pr-4">
                        <h3 className="text-white font-bold text-sm mb-2 leading-tight">Need a <span className="text-yellow-400">Quality Research</span><br/>or <span className="text-yellow-400">Field Report?</span></h3>
                        <p className="text-blue-200 text-[10px] mb-4">We deliver quality work on time, every time.</p>
                        <button onClick={handlePlaceNewOrderClick} className="bg-yellow-400 hover:bg-yellow-500 text-[#0b162c] text-xs font-bold py-2 px-4 rounded-lg transition-colors flex items-center gap-1 w-max">
                            Place New Order <div className="icon-chevron-right text-[14px]"></div>
                        </button>
                    </div>
                    <div className="w-1/3 relative z-10 flex justify-end">
                        <div className="icon-graduation-cap text-[#4d7ef2] text-6xl opacity-80"></div>
                    </div>
                </div>
            </main>
            </>
            )}

            {/* Bottom Navigation (Mobile Only) */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-2 pb-safe flex justify-between items-center z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
                    <button onClick={() => {
                        setShowOrdersPopup(false);
                        setShowNotificationsScreen(false);
                        setShowProfileScreen(false);
                        setViewingOrderId(null);
                    }} className={`flex flex-col items-center px-2 py-1 transition-colors duration-300 ${!showProfileScreen && !showNotificationsScreen && !viewingOrder && !showOrdersPopup ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
                        <div className={`flex items-center justify-center mb-1 transition-all duration-300 ease-in-out ${!showProfileScreen && !showNotificationsScreen && !viewingOrder && !showOrdersPopup ? 'w-8 h-8 bg-blue-600 text-white rounded-full shadow-md shadow-blue-600/30 text-base' : 'w-8 h-8 bg-transparent text-current text-2xl'}`}>
                            <div className="icon-house"></div>
                        </div>
                        <span className="text-[10px] font-medium">Home</span>
                    </button>
                    <button onClick={() => {
                        if(!showOrdersPopup) { pushInnerScreenState(); }
                        setShowOrdersPopup(true);
                        setShowNotificationsScreen(false);
                        setShowProfileScreen(false);
                        setViewingOrderId(null);
                    }} className={`flex flex-col items-center px-2 py-1 transition-colors duration-300 ${showOrdersPopup ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
                        <div className={`flex items-center justify-center mb-1 transition-all duration-300 ease-in-out ${showOrdersPopup ? 'w-8 h-8 bg-blue-600 text-white rounded-full shadow-md shadow-blue-600/30 text-base' : 'w-8 h-8 bg-transparent text-current text-2xl'}`}>
                            <div className="icon-clipboard-list"></div>
                        </div>
                        <span className="text-[10px] font-medium">Orders</span>
                    </button>
                    
                    {/* Center FAB */}
                    <div className="relative -top-6 mx-2">
                        <button onClick={handlePlaceNewOrderClick} className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-600/30 border-4 border-white hover:scale-105 transition-transform">
                            <div className="icon-plus text-2xl"></div>
                        </button>
                        <span className="text-[10px] font-medium text-gray-600 absolute -bottom-5 left-1/2 -translate-x-1/2 w-max">New Order</span>
                    </div>

                    <button onClick={() => {
                        if(!showNotificationsScreen) { pushInnerScreenState(); }
                        setShowNotificationsScreen(true);
                        setShowOrdersPopup(false);
                        setShowProfileScreen(false);
                        setViewingOrderId(null);
                    }} className={`flex flex-col items-center px-2 py-1 transition-colors duration-300 relative ${showNotificationsScreen ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
                        <div className={`flex items-center justify-center mb-1 transition-all duration-300 ease-in-out ${showNotificationsScreen ? 'w-8 h-8 bg-blue-600 text-white rounded-full shadow-md shadow-blue-600/30 text-base' : 'w-8 h-8 bg-transparent text-current text-2xl'}`}>
                            <div className="icon-bell"></div>
                        </div>
                        {unreadNotificationsCount > 0 && (
                            <span className={`absolute ${showNotificationsScreen ? 'top-1 right-2' : 'top-1 right-3'} bg-red-500 text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white transition-all`}>{unreadNotificationsCount}</span>
                        )}
                        <span className="text-[10px] font-medium">Notifications</span>
                    </button>
                    <button onClick={() => {
                        if(!showProfileScreen) { pushInnerScreenState(); }
                        setShowProfileScreen(true);
                        setShowOrdersPopup(false);
                        setShowNotificationsScreen(false);
                        setViewingOrderId(null);
                    }} className={`flex flex-col items-center px-2 py-1 transition-colors duration-300 ${showProfileScreen ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
                        <div className={`flex items-center justify-center mb-1 transition-all duration-300 ease-in-out ${showProfileScreen ? 'w-8 h-8 bg-blue-600 text-white rounded-full shadow-md shadow-blue-600/30 text-base' : 'w-8 h-8 bg-transparent text-current text-2xl'}`}>
                            <div className="icon-user"></div>
                        </div>
                        <span className="text-[10px] font-medium">Profile</span>
                    </button>
                </div>
                
                {/* Safe area padding block for mobile */}
                <div className="h-6"></div>

            {/* My Orders Popup */}
            {showOrdersPopup && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-[#f8f9fc] rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] h-fit flex flex-col overflow-hidden animate-fade-in-up border border-gray-100">
                        <div className="bg-white p-4 border-b border-gray-100 flex justify-center items-center shrink-0">
                            <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                                <div className="icon-clipboard-list text-[var(--primary-color)]"></div> My Orders
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {userOrders.length === 0 ? (
                                <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                        <div className="icon-file-x text-3xl text-gray-400"></div>
                                    </div>
                                    <p className="text-gray-600 font-medium text-sm mb-4">No Any Placed Order.</p>
                                    <button onClick={() => { setShowOrdersPopup(false); handlePlaceNewOrderClick(); }} className="btn-primary py-2 px-6 text-sm">
                                        PLACE NEW ORDER
                                    </button>
                                </div>
                            ) : (
                                userOrders.map(order => (
                                    <div 
                                        key={order.objectId}
                                        onClick={() => { setShowOrdersPopup(false); pushInnerScreenState(); setTrackingKey(Date.now()); setInitialTrackingStep(null); setViewingOrderId(order.objectId); setSkipAnimations(false); }} 
                                        className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
                                    >
                                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-600 rounded-l-xl group-hover:w-1.5 transition-all"></div>
                                        <div className="flex justify-between items-start mb-1.5 pl-1.5">
                                            <div className="flex items-center gap-2">
                                                {order.objectData.status === 'PAID' ? (
                                                    <>
                                                        <span className="bg-green-100 text-green-700 text-[9px] font-bold px-1.5 py-0.5 rounded">PAID</span>
                                                        <span className="text-[9px] font-bold"><span className="text-gray-900">Order No:</span> <span className="text-blue-600">{getOrderNumber(order)}</span></span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="bg-red-100 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded">UNPAID</span>
                                                        <button onClick={(e) => { e.stopPropagation(); setShowOrdersPopup(false); pushInnerScreenState(); setShowPaymentPopup(true); }} className="bg-orange-100 text-orange-600 hover:bg-orange-200 transition-colors px-2 py-0.5 rounded text-[9px] font-bold flex items-center shadow-sm">
                                                            <div className="icon-wallet mr-1"></div> Click here to pay
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                            <button className="text-blue-600 text-[10px] font-semibold flex items-center bg-blue-50 px-2 py-1 rounded group-hover:bg-blue-100 transition-colors">
                                                View <div className="icon-arrow-right ml-1"></div>
                                            </button>
                                        </div>
                                        <div className="pl-1.5">
                                            <h4 className="font-bold text-gray-900 text-xs mb-1 truncate" title={`${order.objectData.reportType} - ${order.objectData.organizationName}`}>
                                                {order.objectData.reportType.toUpperCase()} - {order.objectData.organizationName.toUpperCase()}
                                            </h4>
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-1.5 text-gray-500 text-[10px]">
                                                    <div className="icon-calendar text-[12px]"></div>
                                                    <span>Order Date: {new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                                </div>
                                                {order.objectData.status === 'UNPAID' && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setShowOrdersPopup(false); handleCancelOrder(order.objectId); }} 
                                                        className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded text-[9px] font-bold transition-colors shadow-sm"
                                                    >
                                                        CANCEL ORDER
                                                    </button>
                                                )}
                                            </div>
                                            
                                            {(() => {
                                                const { pct, color, textColor, status } = getProgressInfo(order.objectData, order.objectId);
                                                return (
                                                    <div className="flex flex-col gap-1 w-full mt-1">
                                                        <div className="flex justify-between items-end">
                                                            <span className={`text-[10px] font-bold ${textColor}`}>{status}</span>
                                                            <span className="text-[10px] font-bold text-gray-600">{pct}%</span>
                                                        </div>
                                                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden flex">
                                                            <div className={`${color} h-full rounded-full transition-all duration-500`} style={{ width: `${pct}%` }}></div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-white shrink-0">
                            <button onClick={() => window.history.back()} className="btn-outline w-full py-2 font-bold">CLOSE</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Support Center Popup */}
            {showSupportPopup && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in-up">
                        <div className="bg-[var(--primary-color)] p-4 flex justify-between items-center shrink-0">
                            <h3 className="font-bold text-white text-lg flex items-center gap-2">
                                <div className="icon-headphones"></div> Support Center
                            </h3>
                            <button onClick={() => window.history.back()} className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors">
                                <div className="icon-x text-xl"></div>
                            </button>
                        </div>
                        <div className="p-5 space-y-3 bg-gray-50">
                            <p className="text-gray-600 text-xs text-center mb-4">We're here to help! Reach out to us through any of the channels below.</p>
                            
                            <a href="tel:+255617293971" className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow group">
                                <div className="w-12 h-12 rounded-full border border-gray-100 p-2.5 flex items-center justify-center group-hover:scale-110 transition-transform bg-blue-50 shrink-0">
                                    <img src="https://app.trickle.so/storage/public/images/usr_1859567910000001/4fcb6272-0fb8-44d7-b641-96db73bd3317.png" alt="Phone" className="w-full h-full object-contain" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 text-sm">Call Us</h4>
                                    <p className="text-gray-500 text-xs mt-0.5">+255 617 293 971</p>
                                </div>
                            </a>
                            
                            <a href="sms:+255617293971" className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow group">
                                <div className="w-12 h-12 rounded-full border border-gray-100 p-2 flex items-center justify-center group-hover:scale-110 transition-transform bg-purple-50 shrink-0">
                                    <img src="https://app.trickle.so/storage/public/images/usr_1859567910000001/ec53468f-e167-438b-947e-d06a6f405c0b.png" alt="Message" className="w-full h-full object-contain" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 text-sm">Send SMS</h4>
                                    <p className="text-gray-500 text-xs mt-0.5">+255 617 293 971</p>
                                </div>
                            </a>

                            <a href="https://wa.me/255675935788" className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow group">
                                <div className="w-12 h-12 rounded-full border border-gray-100 p-1.5 flex items-center justify-center group-hover:scale-110 transition-transform bg-green-50 shrink-0">
                                    <img src="https://app.trickle.so/storage/public/images/usr_1859567910000001/2b92f610-046c-4cba-a750-237e56284966.jpeg" alt="WhatsApp" className="w-full h-full object-contain rounded-full" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 text-sm">WhatsApp</h4>
                                    <p className="text-gray-500 text-xs mt-0.5">+255 675 935 788</p>
                                </div>
                            </a>

                            <a href="mailto:hashreportsadmin@gmail.com" className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow group">
                                <div className="w-12 h-12 rounded-full border border-gray-100 p-2 flex items-center justify-center group-hover:scale-110 transition-transform bg-red-50 shrink-0">
                                    <img src="https://app.trickle.so/storage/public/images/usr_1859567910000001/8e742598-b1e9-4755-92c5-191acd639c19.png" alt="Gmail" className="w-full h-full object-contain" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 text-sm">Email Us</h4>
                                    <p className="text-gray-500 text-xs mt-0.5 truncate max-w-[200px]">hashreportsadmin@gmail.com</p>
                                </div>
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {showDeletePopup && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in-up">
                        <div className="p-5 text-center border-b border-gray-100">
                            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3 text-red-500 text-3xl">
                                <div className="icon-triangle-alert"></div>
                            </div>
                            <h3 className="font-bold text-gray-900 text-lg mb-1">Delete Account</h3>
                            <p className="text-gray-500 text-xs">Are you sure you want to permanently delete your account? You will lose all your data.</p>
                        </div>
                        <div className="p-5 bg-gray-50 space-y-4">
                            <div>
                                <label className="form-label text-xs font-bold text-gray-700">Confirm Your Password</label>
                                <div className="relative">
                                    <input 
                                        type="password" 
                                        className={`input-field pr-10 text-sm ${deletePassword.length > 0 && deletePassword !== user.password ? 'input-error' : ''}`}
                                        placeholder="Enter password to confirm"
                                        value={deletePassword}
                                        onChange={(e) => setDeletePassword(e.target.value)}
                                    />
                                    {deletePassword === user.password && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                            <div className="icon-check text-white text-xs"></div>
                                        </div>
                                    )}
                                </div>
                                {deletePassword.length === 0 ? (
                                    <p className="text-red-500 text-[10px] mt-1">Password is required</p>
                                ) : deletePassword !== user.password ? (
                                    <p className="text-red-500 text-[10px] mt-1">Password is incorrect</p>
                                ) : (
                                    <p className="text-green-500 text-[10px] mt-1">Password is correct</p>
                                )}
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button onClick={() => window.history.back()} className="btn-outline flex-1 py-2.5 text-sm !border-gray-300 !text-gray-600 hover:!bg-gray-100">CANCEL</button>
                                <button 
                                    onClick={confirmDeleteAccount} 
                                    disabled={deletePassword !== user.password || isDeletingAccount}
                                    className="btn-primary flex-1 py-2.5 text-sm !bg-red-600 hover:!bg-red-700"
                                >
                                    {isDeletingAccount ? "DELETING..." : "DELETE ACCOUNT"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showChangePasswordPopup && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in-up">
                        <div className="bg-[var(--primary-color)] p-4 flex justify-between items-center shrink-0">
                            <h3 className="font-bold text-white text-lg flex items-center gap-2">
                                <div className="icon-key"></div> Change Password
                            </h3>
                            <button onClick={() => window.history.back()} className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded-full transition-colors">
                                <div className="icon-x text-xl"></div>
                            </button>
                        </div>
                        <div className="p-5 bg-gray-50 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div>
                                <label className="form-label text-xs font-bold text-gray-700">Confirm Your Current Password</label>
                                <div className="relative">
                                    <input 
                                        type="password" 
                                        className={`input-field pr-10 text-sm ${cpCurrentPassword.length > 0 && cpCurrentPassword !== user.password ? 'input-error' : ''}`}
                                        placeholder="Enter current password"
                                        value={cpCurrentPassword}
                                        onChange={(e) => setCpCurrentPassword(e.target.value)}
                                    />
                                    {cpCurrentPassword === user.password && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                            <div className="icon-check text-white text-xs"></div>
                                        </div>
                                    )}
                                </div>
                                {cpCurrentPassword.length === 0 ? (
                                    <p className="text-gray-500 text-[10px] mt-1">Current Password Required</p>
                                ) : cpCurrentPassword !== user.password ? (
                                    <p className="text-red-500 text-[10px] mt-1">Current Password is Incorrect</p>
                                ) : null}
                            </div>

                            {cpCurrentPassword === user.password && (
                                <div className="space-y-4 animate-fade-in">
                                    <div>
                                        <label className="form-label text-xs font-bold text-gray-700">Enter New Password</label>
                                        <div className="relative">
                                            <input 
                                                type="password" 
                                                className={`input-field pr-10 text-sm ${cpNewPassword.length > 0 && cpNewPassword.length < 6 ? 'input-error' : ''}`}
                                                placeholder="At least 6 characters"
                                                value={cpNewPassword}
                                                onChange={(e) => setCpNewPassword(e.target.value)}
                                            />
                                            {cpNewPassword.length >= 6 && (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                                    <div className="icon-check text-white text-xs"></div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="form-label text-xs font-bold text-gray-700">Confirm New Password</label>
                                        <div className="relative">
                                            <input 
                                                type="password" 
                                                className={`input-field pr-10 text-sm ${cpConfirmPassword.length > 0 && cpConfirmPassword !== cpNewPassword ? 'input-error' : ''}`}
                                                placeholder="Must match new password"
                                                value={cpConfirmPassword}
                                                onChange={(e) => setCpConfirmPassword(e.target.value)}
                                            />
                                            {cpConfirmPassword.length >= 6 && cpConfirmPassword === cpNewPassword && (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                                    <div className="icon-check text-white text-xs"></div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <button 
                                onClick={async () => {
                                    setIsChangingPassword(true);
                                    try {
                                        const u = await dbListObjects('user', 1000, false);
                                        const dbUser = u.items.find(item => item.objectData.regNumber === user.regNumber);
                                        if (dbUser) {
                                            await dbUpdateObject('user', dbUser.objectId, { ...dbUser.objectData, password: cpNewPassword });
                                            const updatedUser = { ...user, password: cpNewPassword };
                                            localStorage.setItem('currentUser', JSON.stringify(updatedUser));
                                            
                                            window.history.back();
                                        }
                                    } catch (e) {
                                        console.error(e);
                                    } finally {
                                        setIsChangingPassword(false);
                                    }
                                }} 
                                disabled={
                                    cpCurrentPassword !== user.password || 
                                    cpNewPassword.length < 6 || 
                                    cpConfirmPassword !== cpNewPassword || 
                                    isChangingPassword
                                }
                                className="btn-primary w-full py-3 mt-2 text-sm shadow-md"
                            >
                                {isChangingPassword ? "UPDATING PASSWORD..." : "CHANGE PASSWORD"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* No Order Upload Logbook Popup */}
            {showNoOrderUploadPopup && (
                <div className="fixed inset-0 z-[150] bg-transparent">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-orange-50 rounded-xl shadow-2xl p-5 w-[90%] max-w-sm border border-orange-200 overflow-hidden">
                        <div className="flex flex-col items-center text-center gap-3 relative z-10">
                            <div className="icon-triangle-alert text-orange-500 text-5xl shrink-0"></div>
                            <p className="text-sm font-bold text-orange-900 leading-relaxed">
                                You have no any order. Place a New Order to start Uploading Logbooks.
                            </p>
                        </div>
                        <div className="absolute bottom-0 left-0 h-1 bg-orange-500 animate-shrink-4s"></div>
                    </div>
                </div>
            )}

            <OrderFlow 
                key={orderFlowKey}
                isOpen={showOrderFlow} 
                onClose={() => window.history.back()} 
                user={user} 
                onOrderPlaced={(newOrder) => {
                    updateUserOrders(prev => [newOrder, ...prev]);
                    setShowOrderFlow(false);
                    pushInnerScreenState();
                    setShowPaymentPopup(true);
                }} 
            />

            <Popup 
                isOpen={!!confirmAction}
                title={confirmAction?.title}
                message={confirmAction?.message}
                icon={confirmAction?.icon}
                onConfirm={confirmAction?.onConfirm}
                onCancel={() => setConfirmAction(null)}
                confirmText={confirmAction?.confirmText || "YES, CANCEL"}
                cancelText={confirmAction?.cancelText || "CANCEL"}
                confirmButtonClass={confirmAction?.confirmButtonClass}
                cancelButtonClass={confirmAction?.cancelButtonClass}
            />

            {/* Payment Popup for UNPAID order */}
            {showPaymentPopup && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-fade-in-up border border-gray-100">
                        {editingPayment ? (
                            <div className="p-5">
                                <h3 className="font-bold text-[var(--primary-color)] mb-4 text-center">Badili Taarifa za Malipo</h3>
                                <div className="space-y-4 mb-6">
                                    <ValidatedInput 
                                        label="Namba ya Kufanyia Malipo" 
                                        placeholder="+255XXXXXXXXX"
                                        value={editPaymentData.phone}
                                        onChange={(e) => setEditPaymentData({...editPaymentData, phone: formatPhone(e.target.value)})}
                                        validate={v => (!v || v.length !== 13) ? "Format: +255XXXXXXXXX" : null}
                                    />
                                    <ValidatedInput 
                                        label="Jina la Namba ya Malipo" 
                                        placeholder="FIRST MIDDLE LAST"
                                        value={editPaymentData.name}
                                        onChange={(e) => {
                                            let formatted = e.target.value.toUpperCase().replace(/[^A-Z\s]/g, '').replace(/\s+/g, ' ');
                                            const words = formatted.split(' ');
                                            if (words.length > 3) formatted = words.slice(0, 3).join(' ');
                                            setEditPaymentData({...editPaymentData, name: formatted.trimStart()});
                                        }}
                                        validate={v => {
                                            const parts = v.split(' ');
                                            if (parts.length === 3 && parts[2].length > 0 && parts[2].length < 2) return "Keep typing the third name...";
                                            return null;
                                        }}
                                        forceSuccess={editPaymentData.name.trim().split(/\s+/).length === 3}
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => setEditingPayment(false)} className="btn-outline flex-1 py-2 text-sm">CANCEL</button>
                                    <button 
                                        onClick={async () => {
                                            const orderToUpdate = currentOrder || userOrders[0];
                                            if (orderToUpdate) {
                                                try {
                                                    await dbUpdateObject('field_report_order', orderToUpdate.objectId, {
                                                        ...orderToUpdate.objectData,
                                                        paymentPhone: editPaymentData.phone,
                                                        paymentName: editPaymentData.name
                                                    });
                                                    const updated = {...orderToUpdate, objectData: {...orderToUpdate.objectData, paymentPhone: editPaymentData.phone, paymentName: editPaymentData.name}};
                                                    updateUserOrders(prev => prev.map(o => o.objectId === orderToUpdate.objectId ? updated : o));
                                                    setEditingPayment(false);
                                                } catch(e) {
                                                    console.error("Failed to update payment details", e);
                                                }
                                            }
                                        }}
                                        disabled={editPaymentData.phone.length !== 13 || editPaymentData.name.trim().split(/\s+/).length !== 3}
                                        className="btn-primary flex-1 py-2 text-sm"
                                    >UPDATE</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="bg-[#E40000] p-4 flex justify-between items-center text-white">
                                    <div className="flex items-center gap-2">
                                        <img src="https://app.trickle.so/storage/public/images/usr_1879f92188000001/9ffa4a22-6369-4e42-96d1-cdfd16a902a8.png" alt="Airtel Money Logo" className="w-12 h-9 object-contain drop-shadow-sm" />
                                        <span className="font-bold text-lg">Airtel Money</span>
                                    </div>
                                    <span className="bg-white/20 px-2 py-1 rounded text-xs font-bold border border-white/40">TZS 15,000</span>
                                </div>
                                <div className="p-5">
                                    <p className="text-[11px] text-green-600 font-bold mb-2 text-center truncate w-full">Order Yako Imehifadhiwa. Lipia Ianze Kufanyiwa Kazi.</p>
                                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 shadow-sm mb-4 relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <p className="text-[10px] text-red-600/70 font-bold uppercase tracking-wider mb-1">Airtel Lipa Namba</p>
                                                <p className="font-mono text-xl font-bold text-red-900 tracking-tight">140576405</p>
                                            </div>
                                            <button onClick={handleCopy} className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${copied ? 'bg-red-500 text-white' : 'bg-white text-red-600 hover:bg-red-100 shadow-sm border border-red-200'}`}>
                                                {copied ? 'COPIED' : 'COPY'}
                                            </button>
                                        </div>
                                        <div className="grid gap-2 mt-2 pt-3 border-t border-red-200/50">
                                            <div>
                                                <p className="text-[9px] text-red-800/60 uppercase">Jina La Namba</p>
                                                <p className="font-bold text-red-900 text-sm">SADATI HAMISI KHALIFA</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 shadow-sm mb-5 relative overflow-hidden">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <p className="text-[10px] text-blue-600/70 font-bold uppercase tracking-wider mb-1">Taarifa Zako za Malipo</p>
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    const orderToEdit = currentOrder || userOrders[0];
                                                    if (orderToEdit) {
                                                        setEditPaymentData({
                                                            phone: orderToEdit.objectData.paymentPhone,
                                                            name: orderToEdit.objectData.paymentName
                                                        });
                                                        setEditingPayment(true);
                                                    }
                                                }} 
                                                className="bg-white text-blue-600 hover:bg-blue-100 px-2 py-1 rounded text-[9px] font-bold shadow-sm border border-blue-200 transition-colors"
                                            >
                                                BADILI NAMBA YA MALIPO
                                            </button>
                                        </div>
                                        <div className="grid gap-2">
                                            <div>
                                                <p className="text-[9px] text-blue-800/60 uppercase">Namba Yako Ya Malipo</p>
                                                <p className="font-mono text-sm font-bold text-blue-900">{(currentOrder || userOrders[0])?.objectData.paymentPhone}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] text-blue-800/60 uppercase">Jina La Namba Yako</p>
                                                <p className="font-bold text-blue-900 text-xs">{(currentOrder || userOrders[0])?.objectData.paymentName}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <p className="text-[10px] text-gray-600 mb-5 bg-gray-50 p-3 rounded-lg border border-gray-100 leading-relaxed text-center">
                                        Order yako itapewa Namba ya kufanyiwa kazi itakapolipiwa tu, lipia TZS 15,000 ili Order yako ifanyiwe kazi mapema zaidi. Hakikisha unalipia kwa kutumia Namba ya malipo uliyoweka na kama itakuwa tofauti badilisha hapo juu tafadhali.
                                    </p>

                                    <button onClick={() => window.history.back()} className="btn-primary w-full shadow-md py-2.5">
                                        OKAY
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export { StudentDashboard };
export default StudentDashboard;
