import { useEffect, useRef, useState } from 'react';

import { validateAddress } from '../services/addressApi';
import { createAddressReviewController, emptyAddressReview } from '../services/addressReview';

export function useAddressReview(input, enabled) {
  const [review, setReview] = useState(() => emptyAddressReview());
  const [revision, setRevision] = useState(0);
  const active = useRef(null);

  useEffect(() => {
    const controller = createAddressReviewController({ validate: validateAddress, onChange: setReview });
    active.current = controller;
    setReview(emptyAddressReview(input));
    const timer = enabled && input.trim().length >= 5
      ? setTimeout(() => { void controller.lookup(input); }, 700)
      : null;
    return () => { clearTimeout(timer); controller.cancel(); active.current = null; };
  }, [input, enabled, revision]);

  return {
    review: enabled && review.input === input ? review : emptyAddressReview(input),
    selectCandidate: (id) => active.current?.select(id),
    retry: () => setRevision((value) => value + 1),
  };
}
