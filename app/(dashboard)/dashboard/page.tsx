import { Button } from '../../components/ui/button';

export default function DashboardPage() {
  return (
    <div>
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">Welcome to your Premium IEP Scheduler dashboard</p>
      </div>
      <div className="bg-blue-500 text-white p-4 mb-4">
        If this is blue, Tailwind works
      </div>
      <div className="bg-red-500 text-white p-4 mb-4">
        If this is red, Tailwind works
      </div>
      <div style={{ padding: '20px', marginTop: '20px' }}>
        <Button variant="primary">Test New Blue Color</Button>
        <Button variant="secondary" style={{ marginLeft: '10px' }}>Test Secondary</Button>
        <Button variant="danger" style={{ marginLeft: '10px' }}>Test Danger</Button>
      </div>
      <div className="test-basic-red">BASIC CSS TEST - Should be RED</div>
      <div className="test-basic-blue">BASIC CSS TEST - Should be BLUE</div>
      <div className="bg-blue-500 p-4 text-white">TAILWIND TEST - Should be blue</div>
      <div style={{ padding: '20px' }}>
        <Button variant="primary">Test New Blue Color</Button>
        <Button variant="secondary" style={{ marginLeft: '10px' }}>Test Secondary</Button>
      </div>
    </div>
  );
}