import { useEffect, useState } from 'react';
import axios from '../api/axiosInstance';

const PRIVATE_UPLOAD_URL = /^\/api\/upload\/[a-f0-9-]{36}$/i;

export default function PrivateUploadImage({ url, alt, fallback = null, ...imageProps }) {
  const [objectUrl, setObjectUrl] = useState('');

  useEffect(() => {
    let active = true;
    let createdUrl = '';
    setObjectUrl('');

    if (!PRIVATE_UPLOAD_URL.test(String(url || ''))) return undefined;

    axios.get(url, { responseType: 'blob' })
      .then(({ data }) => {
        createdUrl = URL.createObjectURL(data);
        if (active) setObjectUrl(createdUrl);
        else URL.revokeObjectURL(createdUrl);
      })
      .catch(() => {
        // Missing, deleted, and unauthorized private images deliberately look the same.
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url]);

  return objectUrl ? <img src={objectUrl} alt={alt} {...imageProps} /> : fallback;
}
