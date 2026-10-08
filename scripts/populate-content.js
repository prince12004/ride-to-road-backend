/**
 * One-off content population script.
 *
 * Populates real business data into MongoDB through the actual Admin API
 * (same endpoints and validation a human admin would use) — NOT a hardcoded
 * seed script baked into app startup. Run manually, whenever you want to
 * fill a fresh/empty database with realistic starter content:
 *
 *   cd backend && node scripts/populate-content.js
 *
 */

const API = process.env.API_BASE || "http://localhost:5000/api";
const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "admin@ridetoroad.com";
const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "ChangeMe123!";

let token = "";

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${options.method || "GET"} ${path} -> ${res.status}: ${body.message || "unknown error"}`);
  }
  return body.data;
}

async function findOrCreate(listPath, createPath, matchFn, payload, label) {
  const list = await api(listPath);
  const items = Array.isArray(list) ? list : list?.data || [];
  const existing = items.find(matchFn);
  if (existing) {
    console.log(`  = ${label} already exists, skipping`);
    return existing;
  }
  const created = await api(createPath, { method: "POST", body: JSON.stringify(payload) });
  console.log(`  + created ${label}`);
  return created;
}

async function main() {
  console.log("Logging in as Super Admin...");
  const login = await api("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  token = login.accessToken;
  console.log("Logged in.\n");

  // ---------------------------------------------------------------------
  // Locations
  // ---------------------------------------------------------------------
  console.log("Locations:");
  const locationDefs = [
    { city: "Noida", region: "Delhi NCR", image: { url: "/images/city-noida.jpg", publicId: "static/city-noida" } },
    { city: "Gurgaon", region: "Delhi NCR", image: { url: "/images/city-gurgaon.jpg", publicId: "static/city-gurgaon" } },
    { city: "New Delhi", region: "Delhi NCR", image: { url: "/images/city-delhi.jpg", publicId: "static/city-delhi" } },
    { city: "Ghaziabad", region: "Delhi NCR", image: { url: "/images/city-ghaziabad.jpg", publicId: "static/city-ghaziabad" } },
    { city: "Greater Noida", region: "Delhi NCR", image: { url: "/images/city-greater-noida.jpg", publicId: "static/city-greater-noida" } },
  ];
  const locations = {};
  for (const def of locationDefs) {
    const loc = await findOrCreate("/admin/locations", "/admin/locations", (l) => l.city === def.city, def, def.city);
    locations[def.city] = loc;
  }

  // ---------------------------------------------------------------------
  // Cars
  // ---------------------------------------------------------------------
  console.log("\nCars:");
  const carDefs = [
    {
      name: "Hyundai Creta", brand: "Hyundai", model: "Creta", category: "suv", transmission: "Automatic", fuel: "Petrol",
      seats: 5, pricePerDay: 3200, weeklyPrice: 19500, monthlyPrice: 72000, securityDeposit: 5000, tag: "Popular",
      description: "A comfortable, well-equipped SUV — great for city driving and weekend getaways alike. Smooth automatic gearbox and a spacious cabin for the whole family.",
      features: ["Sunroof", "Rear Camera", "Touchscreen Infotainment", "Cruise Control", "Alloy Wheels"],
      specifications: [{ label: "Mileage", value: "16 km/l" }, { label: "Fuel Tank", value: "50 L" }, { label: "Airbags", value: "6" }],
      location: locations["Noida"]._id, mainImage: { url: "/images/car-creta.jpg", publicId: "static/car-creta" }, isFeatured: true,
    },
    {
      name: "Mahindra Thar", brand: "Mahindra", model: "Thar", category: "suv", transmission: "Manual", fuel: "Diesel",
      seats: 4, pricePerDay: 3800, weeklyPrice: 23000, securityDeposit: 6000, tag: "Adventure Ready",
      description: "Built for the trails. Convertible roof, rugged 4x4 capability and serious road presence — perfect for hill trips and off-road adventures.",
      features: ["4x4 Drive", "Convertible Roof", "Off-Road Tyres", "Touchscreen Infotainment"],
      specifications: [{ label: "Mileage", value: "13 km/l" }, { label: "Ground Clearance", value: "226 mm" }, { label: "Airbags", value: "2" }],
      location: locations["Gurgaon"]._id, mainImage: { url: "/images/car-thar.jpg", publicId: "static/car-thar" }, isFeatured: true,
    },
    {
      name: "Maruti Suzuki Swift", brand: "Maruti Suzuki", model: "Swift", category: "hatchback", transmission: "Manual", fuel: "Petrol",
      seats: 5, pricePerDay: 1500, weeklyPrice: 9000, securityDeposit: 3000, tag: "Budget Friendly",
      description: "Nimble, fuel-efficient and easy to park — the Swift is the perfect city runabout for quick errands or a light weekend trip.",
      features: ["Bluetooth", "Power Steering", "USB Charging"],
      specifications: [{ label: "Mileage", value: "22 km/l" }, { label: "Fuel Tank", value: "37 L" }, { label: "Airbags", value: "2" }],
      location: locations["Noida"]._id, mainImage: { url: "/images/car-swift.jpg", publicId: "static/car-swift" },
    },
    {
      name: "Hyundai Verna", brand: "Hyundai", model: "Verna", category: "sedan", transmission: "Automatic", fuel: "Petrol",
      seats: 5, pricePerDay: 2600, weeklyPrice: 15500, securityDeposit: 4500,
      description: "A refined sedan with a punchy engine and premium cabin — ideal for business trips or a comfortable highway drive.",
      features: ["Sunroof", "Ventilated Seats", "Touchscreen Infotainment", "Cruise Control"],
      specifications: [{ label: "Mileage", value: "18 km/l" }, { label: "Fuel Tank", value: "45 L" }, { label: "Airbags", value: "6" }],
      location: locations["New Delhi"]._id, mainImage: { url: "/images/car-verna.jpg", publicId: "static/car-verna" },
    },
    {
      name: "Kia Seltos", brand: "Kia", model: "Seltos", category: "suv", transmission: "Automatic", fuel: "Petrol",
      seats: 5, pricePerDay: 3000, weeklyPrice: 18000, securityDeposit: 5000, tag: "Feature Loaded",
      description: "Bold styling, a tech-packed cabin and a confident ride — the Seltos is built for drivers who want an SUV that feels premium.",
      features: ["Sunroof", "Ventilated Seats", "360 Camera", "Touchscreen Infotainment", "Cruise Control"],
      specifications: [{ label: "Mileage", value: "16.5 km/l" }, { label: "Fuel Tank", value: "50 L" }, { label: "Airbags", value: "6" }],
      location: locations["Gurgaon"]._id, mainImage: { url: "/images/car-seltos.jpg", publicId: "static/car-seltos" },
    },
    {
      name: "Toyota Innova Crysta", brand: "Toyota", model: "Innova Crysta", category: "suv", transmission: "Automatic", fuel: "Diesel",
      seats: 7, pricePerDay: 4500, weeklyPrice: 27000, monthlyPrice: 98000, securityDeposit: 7000, tag: "Family Pick",
      description: "The go-to choice for big families and group trips — spacious, dependable and comfortable over long distances.",
      features: ["Captain Seats", "Rear AC Vents", "Touchscreen Infotainment", "Cruise Control"],
      specifications: [{ label: "Mileage", value: "12.5 km/l" }, { label: "Fuel Tank", value: "55 L" }, { label: "Airbags", value: "6" }],
      location: locations["New Delhi"]._id, mainImage: { url: "/images/car-innova.jpg", publicId: "static/car-innova" },
    },
    {
      name: "Mercedes-Benz C-Class", brand: "Mercedes-Benz", model: "C-Class", category: "luxury", transmission: "Automatic", fuel: "Petrol",
      seats: 5, pricePerDay: 9500, weeklyPrice: 58000, securityDeposit: 20000, tag: "Premium",
      description: "For the occasions that deserve it — effortless power, a first-class cabin and the badge that turns heads.",
      features: ["Leather Seats", "Ventilated Seats", "Ambient Lighting", "Premium Sound System", "Cruise Control"],
      specifications: [{ label: "Mileage", value: "10 km/l" }, { label: "Fuel Tank", value: "66 L" }, { label: "Airbags", value: "9" }],
      location: locations["Gurgaon"]._id, mainImage: { url: "/images/car-luxury.jpg", publicId: "static/car-luxury" }, tag: "Premium",
    },
    {
      name: "Skoda Slavia", brand: "Skoda", model: "Slavia", category: "sedan", transmission: "Manual", fuel: "Petrol",
      seats: 5, pricePerDay: 2200, weeklyPrice: 13000, securityDeposit: 4000,
      description: "A driver-focused sedan with solid build quality and a confident ride — great for those who enjoy being behind the wheel.",
      features: ["Touchscreen Infotainment", "Cruise Control", "Rear Camera"],
      specifications: [{ label: "Mileage", value: "19 km/l" }, { label: "Fuel Tank", value: "45 L" }, { label: "Airbags", value: "6" }],
      location: locations["Ghaziabad"]._id, mainImage: { url: "/images/car-verna.jpg", publicId: "static/car-verna-2" },
    },
  ];
  for (const def of carDefs) {
    await findOrCreate("/admin/cars", "/admin/cars", (c) => c.name === def.name, def, def.name);
  }

  // ---------------------------------------------------------------------
  // Blog categories + blogs
  // ---------------------------------------------------------------------
  console.log("\nBlog categories:");
  const categoryDefs = [{ name: "Road Trips" }, { name: "Travel Tips" }, { name: "Destinations" }];
  const categories = {};
  for (const def of categoryDefs) {
    const cat = await findOrCreate("/admin/blog-categories", "/admin/blog-categories", (c) => c.name === def.name, def, def.name);
    categories[def.name] = cat;
  }

  console.log("\nBlogs:");
  const blogDefs = [
    {
      title: "The Ultimate Road Trip Checklist Before You Drive Off",
      excerpt: "Everything to check before you hit the highway — documents, car checks, and packing tips for a smooth self-drive trip.",
      category: categories["Travel Tips"]._id,
      image: { url: "/images/blog-checklist.jpg", publicId: "static/blog-checklist" },
      author: "Ride to Road Team",
      status: "PUBLISHED",
      content: `<h2>Before You Leave</h2><p>A great road trip starts long before you turn the key. Here's a quick checklist to make sure you're ready.</p><h2>Documents</h2><ul><li>Valid driving licence and a government photo ID</li><li>Booking confirmation and ID proof used at pickup</li><li>Emergency contact numbers saved offline</li></ul><h2>Car Check</h2><p>Every Ride to Road car is inspected before handover, but it's still good practice to do a quick walk-around: check tyre condition, mirrors, and make sure the fuel level matches what's noted on your handover sheet.</p><h2>Pack Smart</h2><p>Carry a phone mount, a power bank, and download offline maps for stretches with patchy network. A small first-aid kit never hurts either.</p><p>Ready to plan your route? <a href="/cars">Browse our fleet</a> and get moving.</p>`,
    },
    {
      title: "Top 5 Weekend Getaways from Delhi NCR",
      excerpt: "Short on time but craving a getaway? These five destinations are all within a comfortable weekend drive from Delhi NCR.",
      category: categories["Destinations"]._id,
      image: { url: "/images/blog-destinations.jpg", publicId: "static/blog-destinations" },
      author: "Ride to Road Team",
      status: "PUBLISHED",
      content: `<h2>1. Rishikesh</h2><p>Riverside cafes, morning yoga and the Ganga Aarti at Triveni Ghat — a refreshing escape roughly 5-6 hours from Delhi.</p><h2>2. Jaipur</h2><p>Forts, bazaars and unforgettable food — the Pink City is an easy weekend drive with plenty to see in two days.</p><h2>3. Agra</h2><p>Home to the Taj Mahal, Agra is doable even as a long day trip if you leave early.</p><h2>4. Neemrana</h2><p>Closer to home, with heritage stays and a slower pace — great if you just need a short breather.</p><h2>5. Kasauli</h2><p>Pine forests and quiet hill views for those craving a bit of altitude without a long drive.</p><p>Pick your dates, <a href="/cars">choose a car</a> and go.</p>`,
    },
    {
      title: "Self-Drive vs Chauffeur-Driven: Which One Should You Pick?",
      excerpt: "Both have their place — here's how to decide which rental style actually fits your next trip.",
      category: categories["Travel Tips"]._id,
      image: { url: "/images/blog-roadtrips.jpg", publicId: "static/blog-roadtrips" },
      author: "Ride to Road Team",
      status: "PUBLISHED",
      content: `<h2>Self-Drive</h2><p>You set the pace. Stop wherever you want, take the scenic detour, and skip the small talk. Self-drive works best when you're comfortable behind the wheel and want full control of your itinerary.</p><h2>Chauffeur-Driven</h2><p>Better suited for long overnight drives or when you'd rather relax in the back seat. It costs more, but you trade the driving for convenience.</p><h2>Our Take</h2><p>For most weekend trips and city errands, self-drive is simpler, cheaper and more flexible — which is exactly why we built Ride to Road around it.</p>`,
    },
    {
      title: "Rishikesh Road Trip Guide: Routes, Stops & Tips",
      excerpt: "Planning a drive to Rishikesh? Here's the route, the best stops along the way, and a few tips from regulars.",
      category: categories["Road Trips"]._id,
      image: { url: "/images/trip-rishikesh.jpg", publicId: "static/trip-rishikesh" },
      author: "Ride to Road Team",
      status: "PUBLISHED",
      content: `<h2>The Route</h2><p>The Delhi–Rishikesh drive is a smooth 5-6 hour run, mostly via the Delhi-Meerut Expressway. Roads are in good shape for most of the way.</p><h2>Good Stops</h2><ul><li>Roorkee for a quick food break</li><li>Har Ki Pauri if you're passing through Haridwar first</li></ul><h2>Tips</h2><p>Start early to avoid Delhi's morning traffic, and keep the tank topped up before the last stretch — fuel stations thin out closer to Rishikesh.</p><p>Need a car for the drive? <a href="/cars">Book a self-drive SUV</a> and you're set.</p>`,
    },
    {
      title: "5 Tips to Save Money on Your Next Self-Drive Rental",
      excerpt: "Small habits that add up to real savings on your next self-drive booking.",
      category: categories["Travel Tips"]._id,
      image: { url: "/images/hero-suv.jpg", publicId: "static/hero-suv" },
      author: "Ride to Road Team",
      status: "PUBLISHED",
      content: `<h2>1. Book Early</h2><p>Popular cars get booked out on weekends — locking in your dates a few days ahead usually gets you better availability.</p><h2>2. Match the Car to the Trip</h2><p>A hatchback is plenty for a city errand; save the SUV for when you actually need the space.</p><h2>3. Watch Your Fuel Habits</h2><p>Smooth acceleration and steady speeds save more fuel than you'd expect over a long drive.</p><h2>4. Use Coupons</h2><p>Keep an eye on our <a href="/#offers">offers section</a> for seasonal discounts.</p><h2>5. Return On Time</h2><p>Avoid late fees by planning your return trip with a buffer for traffic.</p>`,
    },
  ];
  for (const def of blogDefs) {
    await findOrCreate("/admin/blogs", "/admin/blogs", (b) => b.title === def.title, def, def.title);
  }

  // ---------------------------------------------------------------------
  // FAQs
  // ---------------------------------------------------------------------
  console.log("\nFAQs:");
  const faqDefs = [
    { question: "What documents do I need to rent a self-drive car?", answer: "You'll need a valid driving licence and a government-issued photo ID (Aadhaar, Passport, or Voter ID). We verify these at the time of pickup.", order: 1 },
    { question: "Is there a security deposit?", answer: "Yes, most cars require a refundable security deposit, shown on the car's detail page. It's fully refunded after the car is returned in good condition.", order: 2 },
    { question: "Can I extend my booking after it starts?", answer: "Yes — message us on WhatsApp or call our support number and we'll extend it for you, subject to the car's availability for the extra days.", order: 3 },
    { question: "What happens if I return the car late?", answer: "A grace period of a couple of hours is usually fine, but late returns beyond that are billed at an hourly rate. Please inform us in advance if you expect to be late.", order: 4 },
    { question: "Do you offer doorstep delivery?", answer: "Doorstep delivery is available in select areas of Delhi NCR for an additional fee. Ask us on WhatsApp when booking to check if your location is covered.", order: 5 },
    { question: "What if the car breaks down during my trip?", answer: "Call our support number immediately. We'll arrange a replacement vehicle or roadside assistance as quickly as possible, depending on your location.", order: 6 },
  ];
  for (const def of faqDefs) {
    await findOrCreate("/admin/faqs", "/admin/faqs", (f) => f.question === def.question, def, def.question.slice(0, 40));
  }

  // ---------------------------------------------------------------------
  // Testimonials
  // ---------------------------------------------------------------------
  console.log("\nTestimonials:");
  const testimonialDefs = [
    { name: "Ankit Sharma", location: "Noida", rating: 5, quote: "Booked a Creta for a weekend trip to Rishikesh — smooth process, car was spotless, and the WhatsApp support was quick to respond.", car: "Hyundai Creta", isFeatured: true },
    { name: "Priya Malhotra", location: "Gurgaon", rating: 5, quote: "Loved the Thar for our hill trip. Pickup and drop were hassle-free, and pricing was exactly what was quoted upfront.", car: "Mahindra Thar", isFeatured: true },
    { name: "Rohit Verma", location: "Delhi", rating: 4, quote: "Good experience overall. The Swift was perfect for zipping around the city for a few days.", car: "Maruti Suzuki Swift", isFeatured: true },
    { name: "Sneha Kapoor", location: "Ghaziabad", rating: 5, quote: "First time self-driving and it was easier than I expected. The team walked me through everything at pickup.", car: "Hyundai Verna", isFeatured: false },
    { name: "Vikram Singh", location: "Greater Noida", rating: 5, quote: "Took the Innova for a family trip to Agra — spacious, comfortable, and great mileage for a diesel SUV.", car: "Toyota Innova Crysta", isFeatured: true },
  ];
  for (const def of testimonialDefs) {
    await findOrCreate("/admin/testimonials", "/admin/testimonials", (t) => t.name === def.name && t.quote === def.quote, def, def.name);
  }

  // ---------------------------------------------------------------------
  // Journeys (road trip inspiration)
  // ---------------------------------------------------------------------
  console.log("\nJourneys:");
  const journeyDefs = [
    { from: "Delhi", to: "Agra", distanceKm: 233, driveTime: "3h 30m", highlight: "Home to the Taj Mahal — doable as a long day trip.", image: { url: "/images/trip-agra.jpg", publicId: "static/trip-agra" } },
    { from: "Delhi", to: "Jaipur", distanceKm: 280, driveTime: "5h", highlight: "Forts, bazaars and unforgettable food in the Pink City.", image: { url: "/images/trip-jaipur.jpg", publicId: "static/trip-jaipur" } },
    { from: "Delhi", to: "Rishikesh", distanceKm: 240, driveTime: "5h 30m", highlight: "Riverside cafes and the Ganga Aarti — a refreshing weekend escape.", image: { url: "/images/trip-rishikesh.jpg", publicId: "static/trip-rishikesh" } },
  ];
  for (const def of journeyDefs) {
    await findOrCreate("/admin/journeys", "/admin/journeys", (j) => j.from === def.from && j.to === def.to, def, `${def.from} → ${def.to}`);
  }

  // ---------------------------------------------------------------------
  // Offer
  // ---------------------------------------------------------------------
  console.log("\nOffer:");
  await findOrCreate(
    "/admin/offers",
    "/admin/offers",
    (o) => o.title === "Weekend Getaway Special",
    {
      eyebrow: "Limited offer",
      title: "Weekend Getaway Special",
      description: "Book any SUV for 2 days or more this weekend and save 15% on your total rental.",
      terms: "Valid on weekend bookings only. Cannot be combined with other offers. Subject to vehicle availability.",
      code: "WEEKEND15",
      image: { url: "/images/offer-weekend.jpg", publicId: "static/offer-weekend" },
      ctaLabel: "Book Now",
      ctaHref: "/cars",
      isActive: true,
    },
    "Weekend Getaway Special"
  );

  // ---------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------
  console.log("\nSettings:");
  const currentSettings = await api("/admin/cms/settings");
  await api("/admin/cms/settings", {
    method: "PUT",
    body: JSON.stringify({
      ...currentSettings,
      phone: "+919310811124",
      email: "hello@ridetoroad.com",
      address: "Sector 62, Noida, Delhi NCR, India",
      socialLinks: {
        ...currentSettings.socialLinks,
        instagram: "https://instagram.com/ridetoroad",
        facebook: "https://facebook.com/ridetoroad",
      },
      booking: { ...currentSettings.booking, taxPercent: 5 },
      seo: {
        ...currentSettings.seo,
        defaultDescription: "Premium self-drive car rentals across Delhi NCR. Pick your ride, choose your time, and hit the road on your terms.",
      },
    }),
  });
  console.log("  = settings updated");

  // ---------------------------------------------------------------------
  // Site content pages
  // ---------------------------------------------------------------------
  console.log("\nSite content pages:");
  const siteContentDefs = {
    "about-us": {
      title: "About Us",
      content: `<h2>Our Story</h2><p>Ride to Road started with a simple frustration: booking a rental car in Delhi NCR usually meant long phone calls, unclear pricing, and even less clear paperwork. We built Ride to Road to make self-drive rentals as simple as booking a cab — pick your car, choose your dates, and confirm on WhatsApp.</p><h2>What We Do</h2><p>We maintain a fleet of well-serviced hatchbacks, sedans, SUVs and a few premium cars available for self-drive rental across Noida, Gurgaon, Delhi, Ghaziabad and Greater Noida. Every car is inspected between rentals, and every booking is backed by a real support team you can actually reach.</p><h2>Our Promise</h2><p>Transparent pricing with no hidden charges, well-maintained cars, and support that responds — on WhatsApp, on call, whenever you need it.</p>`,
    },
    "contact-us": {
      title: "Contact Us",
      content: `<p>Have a question about a booking, a car, or anything else? Reach out — we usually respond within a few hours.</p>`,
    },
    "terms-and-conditions": {
      title: "Terms & Conditions",
      content: `<h2>1. Eligibility</h2><p>Renters must be at least 21 years old and hold a valid driving licence for the vehicle category booked. A government-issued photo ID is required at pickup.</p><h2>2. Booking &amp; Payment</h2><p>Bookings are confirmed once payment is completed via Razorpay, or once our team confirms an offline booking. Prices shown at checkout are final unless additional charges (extra kilometers, late return, fuel) apply as noted at pickup.</p><h2>3. Security Deposit</h2><p>A refundable security deposit is collected for most vehicles and returned after the car is inspected on return, minus any applicable deductions for damage or violations.</p><h2>4. Vehicle Use</h2><p>Vehicles may only be driven by the renter named on the booking, within the region agreed at pickup, and must not be used for any illegal purpose, sub-rented, or driven outside India without prior written consent.</p><h2>5. Fuel &amp; Mileage</h2><p>Unless stated otherwise, the vehicle is provided with a certain fuel level and must be returned with the same level. Mileage limits, if any, are specified at the time of booking.</p><h2>6. Liability</h2><p>The renter is responsible for traffic violations, fines and damages incurred during the rental period. Ride to Road is not liable for personal belongings left in the vehicle.</p><h2>7. Changes to These Terms</h2><p>We may update these terms from time to time. Continued use of our services after an update constitutes acceptance of the revised terms.</p>`,
    },
    "cancellation-policy": {
      title: "Cancellation Policy",
      content: `<h2>Customer-Initiated Cancellations</h2><ul><li>More than 24 hours before pickup: full refund.</li><li>Between 6 and 24 hours before pickup: 50% refund.</li><li>Less than 6 hours before pickup, or no-show: no refund.</li></ul><h2>Cancellations by Ride to Road</h2><p>In the rare case we need to cancel a confirmed booking (vehicle unavailability, maintenance issue, etc.), you'll receive a full refund and, where possible, we'll help arrange an alternative vehicle.</p><h2>How to Cancel</h2><p>Message us on WhatsApp or call our support number with your Booking ID to request a cancellation. Refunds, where applicable, are processed to the original payment method within 5-7 business days.</p>`,
    },
    "refund-policy": {
      title: "Return & Refund Policy",
      content: `<h2>Payment Refunds</h2><p>Refunds for cancelled bookings follow our <a href="/cancellation-policy">Cancellation Policy</a> and are credited back to the original payment method via Razorpay within 5-7 business days of approval.</p><h2>Security Deposit Refunds</h2><p>Security deposits are refunded after the vehicle is inspected at return. Deductions may apply for damage beyond normal wear and tear, uncleared traffic fines, or missing fuel compared to pickup level. Any deduction will be clearly explained by our team before the deposit is released.</p><h2>Disputes</h2><p>If you believe a deduction was made in error, contact us on WhatsApp with your Booking ID within 48 hours of the vehicle's return and we'll review it.</p>`,
    },
  };
  for (const [key, def] of Object.entries(siteContentDefs)) {
    const existing = await api(`/admin/cms/site-content/${key}`);
    if (existing.content && existing.content.trim().length > 0) {
      console.log(`  = ${key} already has content, skipping`);
      continue;
    }
    await api(`/admin/cms/site-content/${key}`, { method: "PUT", body: JSON.stringify(def) });
    console.log(`  + filled ${key}`);
  }

  console.log("\nDone! The site now has real starter content across cars, locations, blogs, FAQs, testimonials, journeys, an offer, settings and content pages.");
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});
