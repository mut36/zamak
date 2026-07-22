import Link from 'next/link';
import { BrandMark } from './components/BrandMark';
import { COPY } from './i18n/simpleCopy';

const c = COPY.notFound;

export default function NotFound() {
  return (
    <div className='min-h-screen flex flex-col items-center justify-center px-5 text-center'>
      <BrandMark className='mb-8' />
      <h1 className='text-[22px] font-bold text-ink mb-2'>{c.title}</h1>
      <p className='text-[14px] text-ink-2 mb-7 max-w-[320px]'>{c.body}</p>
      <Link href='/' className='btn btn-primary btn-lg'>
        {c.home}
      </Link>
    </div>
  );
}
