export class Logger {
    private getTimestamp(): string {
        return new Date().toISOString();
    }

    private formatMessage(level: string, message: string, ...args: any[]): string {
        const timestamp = this.getTimestamp();
        const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ') : '';
        
        return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}`;
    }

    public info(message: string, ...args: any[]): void {
        console.log(this.formatMessage('info', message, ...args));
    }

    public warn(message: string, ...args: any[]): void {
        console.warn(this.formatMessage('warn', message, ...args));
    }

    public error(message: string, ...args: any[]): void {
        console.error(this.formatMessage('error', message, ...args));
    }

    public debug(message: string, ...args: any[]): void {
        if (process.env.NODE_ENV === 'development') {
            console.debug(this.formatMessage('debug', message, ...args));
        }
    }
}
