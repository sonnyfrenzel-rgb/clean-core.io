'use client';

import { useState } from 'react';
import { getDb, getAuth } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function FileUpload() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.abap') && file.type !== 'text/plain') {
      setError('Only .abap or .txt files are allowed.');
      return;
    }
    if (file.size > 1024 * 1024) { 
      setError('File size must be less than 1MB.');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const db = getDb();
      const auth = getAuth();
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result as string;
        
        const userId = auth.currentUser?.uid;
        if (!userId) {
          setError('You must be logged in to upload files.');
          setUploading(false);
          return;
        }

        await addDoc(collection(db, 'files'), {
          name: file.name,
          content: content,
          userId: userId,
          createdAt: serverTimestamp(),
        });
        
        setUploading(false);
        alert('File uploaded successfully!');
      };
      reader.readAsText(file);
    } catch (err) {
      console.error(err);
      setError('Failed to upload file.');
      setUploading(false);
    }
  };

  return (
    <div className="border p-4 rounded">
      <h2 className="text-2xl font-bold mb-2">Upload Legacy Code</h2>
      <input type="file" onChange={handleFileChange} disabled={uploading} />
      {uploading && <p>Uploading...</p>}
      {error && <p className="text-red-500">{error}</p>}
    </div>
  );
}
