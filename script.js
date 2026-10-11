import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyD4xg5pQ92oyb37YJfA3e3KmGN1q0-ThIQ",
    authDomain: "mywebsite-72df0.firebaseapp.com",
    projectId: "mywebsite-72df0",
    storageBucket: "mywebsite-72df0.firebasestorage.app",
    messagingSenderId: "538159276455",
    appId: "1:538159276455:web:3b61ea7c2b427ee6c11682",
    measurementId: "G-XGGF1946BT"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const ADMIN_EMAIL = "shunsukenoguchi@icloud.com"; 

let isAdmin = false;
let allMessagesCache = [];

function showToast(message) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.style.cssText = `
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: rgba(30, 41, 59, 0.95);
            color: #fff;
            padding: 12px 24px;
            border-radius: 30px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.1);
            font-size: 14px;
            font-weight: bold;
            z-index: 9999;
            transition: transform 0.3s ease, opacity 0.3s ease;
            opacity: 0;
            backdrop-filter: blur(10px);
        `;
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
        toast.style.opacity = '1';
    }, 10);

    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(100px)';
        toast.style.opacity = '0';
    }, 2500);
}

// 認証状態の監視
onAuthStateChanged(auth, (user) => {
    const adminContentArea = document.getElementById('admin-content-area');
    const loginSection = document.getElementById('login-section');
    const userEmailDisplay = document.getElementById('user-email-display');
    const adminBadgeContainer = document.getElementById('admin-badge-container');

    if (user && user.email === ADMIN_EMAIL) {
        isAdmin = true;
        if (adminContentArea) adminContentArea.style.display = 'block';
        if (loginSection) loginSection.style.display = 'none';
        if (userEmailDisplay) userEmailDisplay.textContent = `ログイン中: ${user.email}`;
        if (adminBadgeContainer) adminBadgeContainer.style.display = 'block';
    } else {
        isAdmin = false;
        if (adminContentArea) adminContentArea.style.display = 'none';
        if (loginSection) loginSection.style.display = 'block';
        if (adminBadgeContainer) adminBadgeContainer.style.display = 'none';

        if (user) {
            showToast("管理者権限のないアカウントです。");
            signOut(auth);
        }
    }
    loadMessages();
});

// Googleログインボタン（ポップアップ認証）
const googleLoginBtn = document.getElementById('google-login-btn');
if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("ログインエラー:", error);
            showToast("Googleログインに失敗しました。");
        }
    });
}

// ログアウトボタン
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            showToast("ログアウトしました。");
            setTimeout(() => window.location.reload(), 800);
        } catch (error) {
            console.error("ログアウトエラー:", error);
        }
    });
}

async function loadMessages() {
    const msgContainer = document.getElementById('message-container');
    if (!msgContainer) return;

    msgContainer.innerHTML = '<p style="text-align: center; font-size: 13px; color: var(--text-sub);">読み込み中...</p>';

    try {
        const q = query(collection(db, "messages"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        
        allMessagesCache = [];
        querySnapshot.forEach((documentSnap) => {
            allMessagesCache.push({ id: documentSnap.id, ...documentSnap.data() });
        });

        let displayMessages = allMessagesCache;
        const isIndexPage = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');
        
        if (isIndexPage) {
            displayMessages = allMessagesCache.slice(0, 7);
        }

        renderMessageList(displayMessages);
        renderMediaGrid();

    } catch (e) {
        console.error("データ取得エラー: ", e);
        msgContainer.innerHTML = '<p style="color: red; text-align: center; font-size: 14px;">メッセージの読み込みに失敗しました。</p>';
    }
}

function renderMessageList(messagesToRender = allMessagesCache) {
    const container = document.getElementById('message-container');
    if (!container) return;

    if (messagesToRender.length === 0) {
        container.innerHTML = '<p style="font-size: 14px; text-align: center; color: var(--text-sub);">まだメッセージはありません。</p>';
        return;
    }

    container.innerHTML = '';
    messagesToRender.forEach((data) => {
        const docId = data.id;
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';

        let dateStr = '';
        if (data.createdAt) {
            const date = data.createdAt.toDate();
            dateStr = `${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        }

        let adminButtons = '';
        if (isAdmin) {
            adminButtons = `
                <div class="admin-actions">
                    <button class="btn-action btn-edit" onclick="openEditModal('${docId}')">編集</button>
                    <button class="btn-action btn-delete" onclick="deleteMessage('${docId}')">削除</button>
                </div>
            `;
        }

        let imagesArray = data.imageUrls || (data.imageUrl ? [data.imageUrl] : []);
        let imagesHtml = '';
        if (imagesArray.length > 0) {
            let imgTags = imagesArray.map(url => `
                <img src="${url}" onclick="openImageModal('${url}')" style="height: 100px; max-width: 150px; border-radius: 6px; cursor: pointer; object-fit: cover; transition: 0.2s;" onmouseover="this.style.opacity=0.85" onmouseout="this.style.opacity=1" title="クリックして拡大">
            `).join('');
            imagesHtml = `<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">${imgTags}</div>`;
        }

        chatItem.innerHTML = `
            <div class="chat-user-box">
                <img src="cat.png" alt="猫アイコン" class="chat-avatar" onerror="this.src='https://via.placeholder.com/44?text=CAT'">
                <div class="chat-author">のぐしゅん</div>
            </div>
            <div class="chat-bubble">
                <p style="white-space: pre-wrap; margin-bottom: 6px; font-size: 14px;" id="text-${docId}">${linkifyText(data.text || '')}</p>
                ${imagesHtml}
                <div style="font-size: 10px; color: var(--text-sub); text-align: right; margin-top: 6px;">${dateStr}</div>
                ${adminButtons}
            </div>
        `;
        container.appendChild(chatItem);
    });

    const isIndexPage = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');
    if (isIndexPage && allMessagesCache.length > 7) {
        let moreLink = document.createElement('div');
        moreLink.style.cssText = 'text-align: center; margin-top: 10px;';
        moreLink.innerHTML = `<a href="messages.html" style="color: #3b82f6; font-size: 13px; text-decoration: none;">過去のメッセージをもっと見る →</a>`;
        container.appendChild(moreLink);
    }
}

function renderMediaGrid() {
    const container = document.getElementById('media-container');
    if (!container) return;

    let allImages = [];
    allMessagesCache.forEach(data => {
        let imgs = data.imageUrls || (data.imageUrl ? [data.imageUrl] : []);
        imgs.forEach(url => allImages.push(url));
    });

    if (allImages.length === 0) {
        container.innerHTML = '<p style="font-size: 14px; text-align: center; color: var(--text-sub); width: 100%;">まだメディア（画像）はありません。</p>';
        return;
    }

    container.innerHTML = allImages.map(url => `
        <img src="${url}" onclick="openImageModal('${url}')" style="width: calc(33.333% - 6px); height: 110px; border-radius: 8px; cursor: pointer; object-fit: cover; transition: 0.2s;" onmouseover="this.style.opacity=0.85" onmouseout="this.style.opacity=1" title="クリックして拡大">
    `).join('');
}

const tabMsgBtn = document.getElementById('tab-msg-btn');
const tabMediaBtn = document.getElementById('tab-media-btn');
const messageContainer = document.getElementById('message-container');
const mediaContainer = document.getElementById('media-container');

if (tabMsgBtn && tabMediaBtn) {
    tabMsgBtn.addEventListener('click', () => {
        tabMsgBtn.classList.add('active-tab');
        tabMediaBtn.classList.remove('active-tab');
        if (messageContainer) messageContainer.style.display = 'flex';
        if (mediaContainer) mediaContainer.style.display = 'none';
    });

    tabMediaBtn.addEventListener('click', () => {
        tabMediaBtn.classList.add('active-tab');
        tabMsgBtn.classList.remove('active-tab');
        if (mediaContainer) mediaContainer.style.display = 'flex';
        if (messageContainer) messageContainer.style.display = 'none';
    });
}

const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('input-image');
const dropText = document.getElementById('drop-text');

if (fileInput) fileInput.multiple = true;

let selectedFiles = [];

if (dropArea && fileInput) {
    dropArea.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropArea.style.background = 'rgba(255,255,255,0.08)';
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropArea.style.background = 'rgba(255,255,255,0.02)';
        });
    });

    dropArea.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            selectedFiles = files;
            updateDropAreaText();
        }
    });

    fileInput.addEventListener('change', () => {
        const files = Array.from(fileInput.files);
        if (files.length > 0) {
            selectedFiles = files;
            updateDropAreaText();
        }
    });
}

function updateDropAreaText() {
    if (!dropText) return;
    if (selectedFiles.length > 0) {
        let fileNames = selectedFiles.map(f => f.name).join(', ');
        dropText.innerHTML = `📷 選択中 (${selectedFiles.length}枚): ${fileNames} <br><span style="font-size:11px; color:#ef4444; cursor:pointer;" id="cancel-selection">❌ 選択をすべて解除</span>`;
        
        const cancelBtn = document.getElementById('cancel-selection');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectedFiles = [];
                fileInput.value = '';
                dropText.textContent = '📸 画像をドロップ または クリックして選択（複数可）';
            });
        }
    } else {
        dropText.textContent = '📸 画像をドロップ または クリックして選択（複数可）';
    }
}

const adminForm = document.getElementById('admin-form');
if (adminForm) {
    adminForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const textVal = document.getElementById('input-text').value;

        let imageUrls = [];
        for (const file of selectedFiles) {
            try {
                const compressed = await resizeAndCompressImage(file, 800, 0.7);
                imageUrls.push(compressed);
            } catch (err) {
                console.error("画像処理エラー:", err);
            }
        }

        try {
            await addDoc(collection(db, "messages"), {
                text: textVal,
                imageUrls: imageUrls,
                createdAt: serverTimestamp()
            });

            showToast('投稿が完了しました！');
            document.getElementById('input-text').value = '';
            selectedFiles = [];
            if (fileInput) fileInput.value = '';
            if (dropText) dropText.textContent = '📸 画像をドロップ または クリックして選択（複数可）';
            loadMessages();
        } catch (e) {
            console.error("投稿エラー: ", e);
            showToast('投稿に失敗しました。');
        }
    });
}

window.openImageModal = (imageUrl) => {
    let modal = document.getElementById('image-zoom-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'image-zoom-modal';
        modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 300; justify-content: center; align-items: center; cursor: pointer;';
        modal.innerHTML = `<img id="zoom-img" style="max-width: 90%; max-height: 90%; border-radius: 8px; object-fit: contain;">`;
        document.body.appendChild(modal);
        modal.addEventListener('click', () => { modal.style.display = 'none'; });
    }
    document.getElementById('zoom-img').src = imageUrl;
    modal.style.display = 'flex';
};

let editingDocId = null;
let editCurrentImages = [];

window.openEditModal = async (docId) => {
    editingDocId = docId;
    
    try {
        const docRef = doc(db, "messages", docId);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
            showToast("データが見つかりませんでした。");
            return;
        }
        const data = docSnap.data();
        const currentText = data.text || "";
        editCurrentImages = data.imageUrls || (data.imageUrl ? [data.imageUrl] : []);

        let modal = document.getElementById('edit-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'edit-modal';
            modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 200; justify-content: center; align-items: center;';
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });

            modal.innerHTML = `
                <div class="card" style="width: 90%; max-width: 400px; position: relative; max-height: 90vh; overflow-y: auto;">
                    <h2 style="margin-bottom: 12px; font-size: 16px;">メッセージを編集</h2>
                    <hr style="border: none; border-top: 1px solid var(--border); margin-bottom: 16px;">
                    <textarea id="edit-input-text" style="width: 100%; height: 80px; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: rgba(0,0,0,0.2); color: #fff; resize: vertical; margin-bottom: 12px;"></textarea>
                    
                    <div style="margin-bottom: 12px;">
                        <p style="font-size: 12px; color: var(--text-sub); margin-bottom: 6px;">画像:</p>
                        <div id="edit-image-preview-container" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;"></div>
                        <input type="file" id="edit-file-input" accept="image/*" multiple style="display: none;">
                        <button type="button" id="edit-select-img-btn" class="btn-action" style="background: #3b82f6; color: #fff; padding: 6px 12px; font-size: 12px;">画像を追加・変更</button>
                        <button type="button" id="edit-clear-img-btn" class="btn-action" style="background: #ef4444; color: #fff; padding: 6px 12px; font-size: 12px;">すべての画像を削除</button>
                    </div>

                    <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;">
                        <button id="edit-cancel-btn" class="btn-action" style="background: #64748b; color: #fff; padding: 8px 16px;">キャンセル</button>
                        <button id="edit-save-btn" class="btn-action" style="background: #22c55e; color: #fff; padding: 8px 16px;">保存する</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById('edit-cancel-btn').addEventListener('click', () => {
                modal.style.display = 'none';
            });

            document.getElementById('edit-select-img-btn').addEventListener('click', () => {
                document.getElementById('edit-file-input').click();
            });

            document.getElementById('edit-file-input').addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                for (const file of files) {
                    try {
                        const compressed = await resizeAndCompressImage(file, 800, 0.7);
                        editCurrentImages.push(compressed);
                    } catch (err) {
                        console.error("編集画像エラー:", err);
                    }
                }
                updateEditImagePreview();
            });

            document.getElementById('edit-clear-img-btn').addEventListener('click', () => {
                editCurrentImages = [];
                updateEditImagePreview();
            });

            document.getElementById('edit-save-btn').addEventListener('click', async () => {
                const newText = document.getElementById('edit-input-text').value;
                if (editingDocId) {
                    try {
                        const msgRef = doc(db, "messages", editingDocId);
                        await updateDoc(msgRef, { 
                            text: newText,
                            imageUrls: editCurrentImages
                        });
                        showToast("更新しました！");
                        modal.style.display = 'none';
                        loadMessages();
                    } catch (e) {
                        console.error("更新エラー: ", e);
                        showToast("更新に失敗しました。");
                    }
                }
            });
        }

        document.getElementById('edit-input-text').value = currentText;
        updateEditImagePreview();
        modal.style.display = 'flex';

    } catch (e) {
        console.error("編集データ取得エラー:", e);
        showToast("データの読み込みに失敗しました。");
    }
};

function updateEditImagePreview() {
    const previewContainer = document.getElementById('edit-image-preview-container');
    if (!previewContainer) return;

    if (editCurrentImages.length > 0) {
        previewContainer.innerHTML = editCurrentImages.map(url => `
            <img src="${url}" style="height: 60px; max-width: 80px; border-radius: 4px; object-fit: cover;">
        `).join('');
    } else {
        previewContainer.innerHTML = `<p style="font-size: 11px; color: var(--text-sub);">画像なし</p>`;
    }
}

window.deleteMessage = async (docId) => {
    let modal = document.getElementById('custom-confirm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'custom-confirm-modal';
        modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 400; justify-content: center; align-items: center;';
        modal.innerHTML = `
            <div class="card" id="confirm-card" style="width: 90%; max-width: 320px; text-align: center; position: relative;">
                <p id="confirm-text" style="font-size: 16px; margin-bottom: 20px; color: var(--text-main);">このメッセージを削除しますか？</p>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button id="confirm-cancel-btn" class="btn-action" style="background: #64748b; padding: 8px 16px; font-size: 13px;">キャンセル</button>
                    <button id="confirm-ok-btn" class="btn-action" style="background: #ef4444; padding: 8px 16px; font-size: 13px;">削除する</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    modal.style.display = 'flex';

    const cancelBtn = document.getElementById('confirm-cancel-btn');
    const okBtn = document.getElementById('confirm-ok-btn');

    const newCancelBtn = cancelBtn.cloneNode(true);
    const newOkBtn = okBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);

    newCancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    newOkBtn.addEventListener('click', async () => {
        modal.style.display = 'none';
        try {
            await deleteDoc(doc(db, "messages", docId));
            showToast("削除しました！");
            loadMessages();
        } catch (e) {
            console.error("削除エラー: ", e);
            showToast("削除に失敗しました。");
        }
    });
};

function resizeAndCompressImage(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function linkifyText(text) {
    if (!text) return '';
    const escaped = escapeHtml(text);
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    return escaped.replace(urlPattern, '<a href="$1" target="_blank" style="color: #3b82f6; text-decoration: underline;">$1</a>');
}