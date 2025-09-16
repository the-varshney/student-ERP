const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const admin = require('firebase-admin');

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

router.post('/create-order', async (req, res) => {
  const { amount } = req.body;

  const options = {
    amount: amount, // paise
    currency: "INR", 
    receipt: `receipt_order_${Date.now()}`,
  };

  try {
    // Check if keys are loaded correctly
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error("Razorpay API keys are not configured on the server.");
    }
    
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    res.status(500).send(error.message || "Error creating order");
  }
});

// The /verify route remains the same
router.post('/verify', async (req, res) => {
  const { 
    razorpay_order_id, 
    razorpay_payment_id, 
    razorpay_signature, 
    feeCollectionId,
    studentId,
    amount
  } = req.body;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  const hmac = crypto.createHmac('sha256', key_secret);
  hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
  const generated_signature = hmac.digest('hex');

  if (generated_signature === razorpay_signature) {
    try {
      const db = admin.firestore(); 
      const paymentRef = db.collection('Students').doc(studentId).collection('payments').doc(razorpay_payment_id);
      
      await paymentRef.set({
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        feeCollectionId: feeCollectionId,
        amount: amount,
        status: 'successful',
        paymentDate: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      res.json({ status: 'success', message: 'Payment successfully recorded.' });
    } catch (dbError) {
      console.error("Firestore Error:", dbError);
      res.status(500).json({ status: 'error', message: 'Database update failed.' });
    }
  } else {
    res.status(400).json({ status: 'error', message: 'Payment verification failed.' });
  }
});

module.exports = router;
