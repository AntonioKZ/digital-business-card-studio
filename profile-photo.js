function renderProfilePhoto(doc, value) {
  doc.querySelector('.studio-profile-photo')?.remove();
  if (typeof value !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return;
  const identity = doc.querySelector('.identity');
  if (!identity) return;
  const photo = doc.createElement('img');
  photo.className = 'studio-profile-photo';
  photo.src = value;
  photo.alt = '';
  photo.width = 72;
  photo.height = 72;
  photo.style.cssText = 'display:block;object-fit:cover;border-radius:50%;margin:0 0 8px';
  identity.prepend(photo);
}
