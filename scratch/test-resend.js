async function testResend() {
  const resendApiKey = 're_Jg6CUfFb_M5Kbw3Nt1H3fmbf23tsPKYSe';
  console.log('Testing Resend API Key...');
  
  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Clean-Core Pilot <system@clean-core.io>',
        to: 'sonny.frenzel@googlemail.com',
        subject: '🚀 Clean-Core.io Resend API Test',
        html: '<h3>Test Successful</h3><p>If you see this, the Resend API key is fully active and functional!</p>',
      }),
    });

    const status = resendRes.status;
    const text = await resendRes.text();
    console.log(`Status: ${status}`);
    console.log(`Response: ${text}`);
  } catch (err) {
    console.error('Error calling Resend API:', err);
  }
}

testResend();
