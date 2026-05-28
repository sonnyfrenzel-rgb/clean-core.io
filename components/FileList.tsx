'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { getDb, getAuth, handleFirestoreError, OperationType } from '@/lib/firebase';
import Link from 'next/link';

export default function FileList() {
  const [files, setFiles] = useState<any[]>([]);

  useEffect(() => {
    const auth = getAuth();
    const db = getDb();
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'files'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fileData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setFiles(fileData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'files');
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="border p-4 rounded">
      <h2 className="text-2xl font-bold mb-4">Uploaded Files</h2>
      {files.length === 0 ? (
        <p>No files uploaded yet.</p>
      ) : (
        <ul className="space-y-2">
          {files.map((file) => (
            <li key={file.id} className="border-b pb-2 flex justify-between items-center">
              <div>
                <span className="font-medium">{file.name}</span>
                <span className="text-sm text-[#003D7C]/60 ml-2">
                  {file.createdAt?.toDate ? file.createdAt.toDate().toLocaleDateString() : new Date(file.createdAt).toLocaleDateString()}
                </span>
              </div>
              <Link href={`/analysis/${file.id}`} className="text-[#009EE3] hover:underline text-sm">Analyze</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
