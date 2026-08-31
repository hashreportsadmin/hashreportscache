import React from 'react';

const ContactFooter = () => (
    <div className="mt-2 md:mt-8 flex flex-col items-center justify-center w-full z-0 relative pb-4 md:pb-6" data-name="contact-footer" data-file="components/ContactFooter.js">
        <p className="text-gray-500 font-semibold text-sm mb-3">Contact Us</p>
        <div className="flex gap-4 mb-8">
            <a href="tel:0617293971" className="w-11 h-11 rounded-full overflow-hidden border border-gray-200 shadow-sm hover:scale-110 transition-transform bg-white p-2.5 flex items-center justify-center">
                <img src="https://app.trickle.so/storage/public/images/usr_1859567910000001/4fcb6272-0fb8-44d7-b641-96db73bd3317.png" alt="Phone" className="w-full h-full object-contain" />
            </a>
            <a href="sms:0617293971" className="w-11 h-11 rounded-full overflow-hidden border border-gray-200 shadow-sm hover:scale-110 transition-transform bg-white p-2 flex items-center justify-center">
                <img src="https://app.trickle.so/storage/public/images/usr_1859567910000001/ec53468f-e167-438b-947e-d06a6f405c0b.png" alt="Message" className="w-full h-full object-contain" />
            </a>
            <a href="https://wa.me/255675935788" className="w-11 h-11 rounded-full overflow-hidden border border-gray-200 shadow-sm hover:scale-110 transition-transform bg-white p-1.5 flex items-center justify-center">
                <img src="https://app.trickle.so/storage/public/images/usr_1859567910000001/2b92f610-046c-4cba-a750-237e56284966.jpeg" alt="WhatsApp" className="w-full h-full object-contain rounded-full" />
            </a>
            <a href="mailto:hashreportsadmin@gmail.com" className="w-11 h-11 rounded-full overflow-hidden border border-gray-200 shadow-sm hover:scale-110 transition-transform bg-white p-2 flex items-center justify-center">
                <img src="https://app.trickle.so/storage/public/images/usr_1859567910000001/8e742598-b1e9-4755-92c5-191acd639c19.png" alt="Gmail" className="w-full h-full object-contain" />
            </a>
        </div>
        <p className="text-gray-400 text-xs text-center font-medium">&copy; 2026 HashREPORTS. All rights reserved.</p>
    </div>
);

export { ContactFooter };
export default ContactFooter;
