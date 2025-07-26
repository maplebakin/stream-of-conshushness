import { useState } from 'react';
import axios from './api/axiosInstance';

export default function ImageUploader({ onUpload }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);

  const handleChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
    }
  };

  const handleUpload = async () => {
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onUpload(res.data.url);
    } catch (err) {
      console.error('Upload failed:', err);
    }
  };

  return (
    <div className="image-uploader">
      <input type="file" accept="image/*" onChange={handleChange} />
      {preview && <img src={preview} alt="Preview" style={{ maxWidth: 200, marginTop: 10 }} />}
      <button onClick={handleUpload}>Upload</button>
    </div>
  );
}
