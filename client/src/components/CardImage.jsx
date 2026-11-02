import { useState } from 'react';
import { logoFor } from '../format.js';

// Card art when we have it, otherwise the game's logo from public/logos/
export default function CardImage({ src, game, alt, className = 'card-img' }) {
  const [failed, setFailed] = useState(false);
  const useLogo = !src || failed;
  return (
    <img
      className={`${className}${useLogo ? ' logo' : ''}`}
      src={useLogo ? logoFor(game) : src}
      alt={alt || game}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
